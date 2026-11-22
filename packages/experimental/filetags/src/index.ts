/**
 * Tags for files and directories anywhere on the machine, stored in one central
 * database instead of in the managed directories. The service backs the
 * `fileTags` Remote namespace the right Sidebar consumes, and registers the tag,
 * untag, search, and list model tools over the same store.
 * @module @deepseek-ai/dsh-filetags
 */

import type { Context } from '@deepseek-ai/cordis'
import { isAbsolute, resolve } from 'node:path'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { schema, type Config } from './config.ts'
import { openFiletagsDatabase } from './schema.ts'
import { TagExpressionError } from './query.ts'
import { FiletagStore, PathArgumentError, TagNameError } from './store.ts'
import type { EntryRequest, SearchRequest, TaggedEntry, TagRequest, TagSummary } from './types.ts'

export type * from './types.ts'
export type { Config } from './config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Central file-tag store shared by the model tools and the Sidebar panel. */
    fileTags: FileTags
  }
}

/** Result cap for a single search; the model tool states it and the browser face inherits it. */
const SEARCH_LIMIT = 200

const ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string', required: true },
    isDir: { type: 'boolean', required: true },
    tags: { type: 'array', required: true, items: { type: 'string' } },
  },
} as const

const TAG_COUNT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', required: true },
    count: { type: 'integer', required: true },
  },
} as const

const PATHS_PARAMETER = {
  type: 'array',
  required: true,
  items: { type: 'string' },
  description: 'Absolute paths of existing files or directories anywhere on this machine.',
} as const

const TAGS_PARAMETER = {
  type: 'array',
  required: true,
  items: { type: 'string' },
  description: 'Tag names: one word each, without spaces or parentheses. Tags are created on first use.',
} as const

/**
 * Copy a stored entry into the mutable JSON shape the tool output schema declares.
 * @param entry - stored entry with readonly fields.
 * @returns the same fields with a mutable tag list.
 */
function mutableEntry(entry: TaggedEntry): { path: string; isDir: boolean; tags: string[] } {
  return { path: entry.path, isDir: entry.isDir, tags: [...entry.tags] }
}

/**
 * Require a path to be absolute, since the store keys entries by absolute path, and normalize it.
 * @param path - path supplied by a model tool or the browser face.
 * @returns the normalized absolute path.
 * @throws {PathArgumentError} when the path is relative.
 */
function absolutePath(path: string): string {
  if (!isAbsolute(path)) throw new PathArgumentError(`paths must be absolute: ${path}`)
  return resolve(path)
}

/**
 * Convert a store input failure into a coded Remote failure.
 * @param error - failure raised by the store or a path check.
 * @returns the Remote failure to throw.
 */
function remoteFailure(error: unknown): RemoteError {
  if (error instanceof TagExpressionError || error instanceof TagNameError || error instanceof PathArgumentError) {
    return new RemoteError('filetags/invalid-argument', error.message, {}, { cause: error })
  }
  return new RemoteError('filetags/failed', String(error).replace(/^Error: /u, ''), {}, { cause: error })
}

/**
 * Run a store operation and report its input failures as tool argument errors.
 * @param work - operation that rejects on malformed tag names, paths, or expressions.
 * @returns the operation result.
 */
async function asArgsError<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof TagExpressionError || error instanceof TagNameError || error instanceof PathArgumentError) {
      throw new ToolArgsError([error.message])
    }
    throw error
  }
}

/**
 * Central file-tag service. One database handle serves both the model tools and
 * the `fileTags` Remote namespace, so a tag added in either place is visible in
 * both.
 */
export default class FileTags extends TypertRemoteService {
  static inject = ['tools', 'typert']
  static Config = schema

  private opened: Promise<FiletagStore> | undefined
  private readonly config: Config

  /**
   * Register the Remote service and the four model tools.
   * @param ctx - plugin context carrying the tool registry and the Typert registry.
   * @param config - validated plugin configuration.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'fileTags', { namespace: 'fileTags' })
    this.config = config
    const store = (): Promise<FiletagStore> => this.store()
    ctx.effect(() => () => this.dispose(), 'filetags: database')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'filetags_tag',
      description: 'Attach tags to files or directories anywhere on this machine. Tags live in a central database; nothing is written next to the paths.',
      parameters: { paths: PATHS_PARAMETER, tags: TAGS_PARAMETER },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { tagged: { type: 'integer', required: true } } },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute({ paths, tags }) {
        const normalized = await asArgsError(() => paths.map(path => absolutePath(path)))
        return { tagged: await asArgsError(async () => (await store()).tag(normalized, tags)) }
      },
    })), 'filetags: tag tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'filetags_untag',
      description: 'Remove tags from files or directories. Paths left without any tag are dropped from the database.',
      parameters: { paths: PATHS_PARAMETER, tags: TAGS_PARAMETER },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { removed: { type: 'integer', required: true } } },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute({ paths, tags }) {
        const normalized = await asArgsError(() => paths.map(path => absolutePath(path)))
        return { removed: (await store()).untag(normalized, tags) }
      },
    })), 'filetags: untag tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'filetags_search',
      description: `Find tagged files and directories whose tags match an expression. Combine tag names with "and", "or", "not", and parentheses, for example "project and not archive". Returns at most ${SEARCH_LIMIT} entries sorted by path.`,
      parameters: {
        expression: { type: 'string', required: true, description: 'Tag expression, for example "project and (reviewed or draft)".' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { entries: { type: 'array', required: true, items: ENTRY_SCHEMA } },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute({ expression }) {
        const entries = await asArgsError(async () => (await store()).search(expression, SEARCH_LIMIT))
        return { entries: entries.map(mutableEntry) }
      },
    })), 'filetags: search tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'filetags_list',
      description: 'List tags. Without a path, returns every tag with the number of paths carrying it. With a path, returns that path\'s tags.',
      parameters: {
        path: { type: 'string', description: 'Absolute path whose tags to list. Omit to list all tags.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tags: { type: 'array', items: TAG_COUNT_SCHEMA },
            entry: ENTRY_SCHEMA,
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute({ path }) {
        const opened = await store()
        if (path === undefined) return { tags: opened.tags().map(tag => ({ name: tag.name, count: tag.count })) }
        const entry = opened.entry(await asArgsError(() => absolutePath(path)))
        return entry === undefined ? { tags: [] } : { entry: mutableEntry(entry) }
      },
    })), 'filetags: list tool')
  }

  /**
   * Read every tag with its path count.
   * @param signal - caller cancellation.
   * @returns tags sorted by name.
   */
  @Remote
  async listTags(signal: AbortSignal): Promise<readonly TagSummary[]> {
    signal.throwIfAborted()
    return await this.read(store => store.tags())
  }

  /**
   * Find tagged paths matching a tag expression.
   * @param request - expression and optional result cap; the Host caps it at {@link SEARCH_LIMIT}.
   * @param signal - caller cancellation.
   * @returns matching entries sorted by path.
   */
  @Remote
  async search(request: SearchRequest, signal: AbortSignal): Promise<readonly TaggedEntry[]> {
    signal.throwIfAborted()
    const limit = Math.min(Math.max(request.limit ?? SEARCH_LIMIT, 1), SEARCH_LIMIT)
    return await this.read(store => store.search(request.expression, limit))
  }

  /**
   * Read the tags of one path.
   * @param request - absolute path to read.
   * @param signal - caller cancellation.
   * @returns the tagged entry, or `null` when the path carries no tag.
   */
  @Remote
  async entry(request: EntryRequest, signal: AbortSignal): Promise<TaggedEntry | null> {
    signal.throwIfAborted()
    return await this.read(store => store.entry(absolutePath(request.path)) ?? null)
  }

  /**
   * Attach tags to absolute paths.
   * @param request - paths and tag names to attach.
   * @param signal - caller cancellation.
   * @returns the number of paths tagged.
   */
  @Remote
  async tag(request: TagRequest, signal: AbortSignal): Promise<number> {
    signal.throwIfAborted()
    return await this.read(store => store.tag(request.paths.map(path => absolutePath(path)), [...request.tags]))
  }

  /**
   * Detach tags from absolute paths.
   * @param request - paths and tag names to detach.
   * @param signal - caller cancellation.
   * @returns the number of tag links removed.
   */
  @Remote
  async untag(request: TagRequest, signal: AbortSignal): Promise<number> {
    signal.throwIfAborted()
    return await this.read(store => store.untag(request.paths.map(path => absolutePath(path)), [...request.tags]))
  }

  private async read<T>(work: (store: FiletagStore) => T | Promise<T>): Promise<T> {
    try {
      return await work(await this.store())
    } catch (error) {
      throw remoteFailure(error)
    }
  }

  /** Open the database on first use, retrying after a failed open. */
  private store(): Promise<FiletagStore> {
    this.opened ??= this.openStore()
    return this.opened
  }

  private async openStore(): Promise<FiletagStore> {
    try {
      const db = await openFiletagsDatabase(this.config.path)
      return new FiletagStore(db)
    } catch (error) {
      // A later call retries an open that failed, so a transient filesystem error does not disable the plugin.
      this.opened = undefined
      throw error
    }
  }

  private async dispose(): Promise<void> {
    const opened = this.opened
    this.opened = undefined
    if (opened === undefined) return
    await opened.then(store => store.close(), () => undefined)
  }
}
