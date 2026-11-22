/**
 * Tags for files and directories anywhere on the machine, stored in one central
 * database instead of in the managed directories. Registers the tag, untag,
 * search, and list model tools.
 * @module @deepseek-ai/dsh-experimental-filetags
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { isAbsolute, resolve } from 'node:path'
import { dshPath } from '@deepseek-ai/dsh-home-paths'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { openFiletagsDatabase } from './schema.ts'
import { TagExpressionError } from './query.ts'
import { FiletagStore, TagNameError, type TaggedEntry } from './store.ts'

/** Cordis plugin name. */
export const name = 'filetags'
/** Services the tools register into. */
export const inject = ['tools']

/** Plugin configuration. */
export interface Config {
  /** Absolute path of the central tag database file. */
  path: string
}

/** Schemastery validator for {@link Config}. */
export const Config: z<Config> = z.object({
  path: z.string().default(dshPath('data', 'filetags.db')).description('Central tag database file; created owner-only on first use.'),
})

/** Result cap for a single search. */
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
 * Run a store operation and report its input failures as tool argument errors.
 * @param work - operation that rejects on malformed tag names or expressions.
 * @returns the operation result.
 */
async function asArgsError<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof TagExpressionError || error instanceof TagNameError) throw new ToolArgsError([error.message])
    throw error
  }
}

/**
 * Require a path to be absolute, since the store keys entries by absolute path, and normalize it.
 * @param path - path supplied by the model.
 * @returns the normalized absolute path.
 */
function absolutePath(path: string): string {
  if (!isAbsolute(path)) throw new ToolArgsError([`paths must be absolute: ${path}`])
  return resolve(path)
}

/**
 * Register the file-tag model tools and the central database lifecycle.
 * @param ctx - tool registry and effect scope.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  let opened: Promise<FiletagStore> | undefined
  const store = (): Promise<FiletagStore> => {
    opened ??= openFiletagsDatabase(config.path).then(db => new FiletagStore(db))
    return opened
  }

  ctx.effect(() => () => opened?.then(handle => handle.close(), () => undefined), 'filetags.close')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'filetags_tag',
    description: 'Attach tags to files or directories anywhere on this machine. Tags live in a central database; nothing is written next to the paths.',
    parameters: { paths: PATHS_PARAMETER, tags: TAGS_PARAMETER },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { tagged: { type: 'integer', required: true } } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute({ paths, tags }) {
      const normalized = paths.map(absolutePath)
      const handle = await store()
      return { tagged: await asArgsError(() => handle.tag(normalized, tags)) }
    },
    presentCall: args => ({ card: 'generic', title: 'filetags_tag', rawInput: args }),
  })), 'filetags.tool.tag')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'filetags_untag',
    description: 'Remove tags from files or directories. Paths left without any tag are dropped from the database.',
    parameters: { paths: PATHS_PARAMETER, tags: TAGS_PARAMETER },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { removed: { type: 'integer', required: true } } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute({ paths, tags }) {
      const handle = await store()
      return { removed: handle.untag(paths.map(absolutePath), tags) }
    },
    presentCall: args => ({ card: 'generic', title: 'filetags_untag', rawInput: args }),
  })), 'filetags.tool.untag')

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
      const handle = await store()
      const entries: TaggedEntry[] = await asArgsError(() => handle.search(expression, SEARCH_LIMIT))
      return { entries }
    },
    presentCall: args => ({ card: 'generic', title: 'filetags_search', rawInput: args }),
  })), 'filetags.tool.search')

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
      const handle = await store()
      if (path === undefined) return { tags: handle.tags() }
      const entry = handle.entry(absolutePath(path))
      return entry === undefined ? { tags: [] } : { entry }
    },
    presentCall: args => ({ card: 'generic', title: 'filetags_list', rawInput: args }),
  })), 'filetags.tool.list')
}
