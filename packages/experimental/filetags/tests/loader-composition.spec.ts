import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as Filetags from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot the file-tag plugin through the real Loader, with its database under a temporary directory.
 * @returns the booted context and the realpath of the temporary root.
 */
async function boot(): Promise<{ ctx: Context; base: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-filetags-'))
  const base = await realpath(root)
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-agent', AgentRegistry],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-typert-registry', TypertRegistry],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-executor-native', NativeToolExecutor],
    ['@deepseek-ai/dsh-filetags', Filetags],
  ])
  const config = [...modules.keys()].flatMap(name => [
    `- name: 'cordis:${name}'`,
    ...name === '@deepseek-ai/dsh-filetags' ? ['  config:', `    path: '${join(base, 'state', 'filetags.db')}'`] : [],
  ]).join('\n') + '\n'
  const configPath = join(base, 'cordis.yml')
  await writeFile(configPath, config)

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(base).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  for (const [specifier, plugin] of modules) ctx.loader.builtins[specifier] = plugin
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return { ctx, base }
}

/**
 * Execute one file-tag tool through the registry and return its structured value.
 * @param ctx - booted context.
 * @param name - tool name.
 * @param args - tool arguments.
 * @returns the structured value, or the failure message.
 */
async function call(ctx: Context, name: string, args: Record<string, unknown>): Promise<{ value?: unknown; error?: string }> {
  const result = await executeToolFixture(ctx, {
    name, callId: brandString<ToolCallId>(`${name}-call`), arguments: args, signal: new AbortController().signal,
  })
  if (result.isError) return { error: result.content.map(block => ('text' in block ? block.text : '')).join('') }
  return { value: result.value }
}

describe('dsh-filetags real Loader composition through cordis.yml', () => {
  it('tags, searches, and lists paths outside any managed directory, leaving them untouched', async () => {
    const { ctx, base } = await boot()
    const project = join(base, 'project')
    const archive = join(base, 'archive')
    await mkdir(project)
    await mkdir(archive)
    const note = join(project, 'note.md')
    await writeFile(note, 'hello')

    expect(ctx.tools.schemas().map(tool => tool.name).sort()).toEqual([
      'filetags_list', 'filetags_search', 'filetags_tag', 'filetags_untag',
    ])

    expect(await call(ctx, 'filetags_tag', { paths: [project, note], tags: ['work'] })).toEqual({ value: { tagged: 2 } })
    expect(await call(ctx, 'filetags_tag', { paths: [archive], tags: ['archive'] })).toEqual({ value: { tagged: 1 } })
    expect(await call(ctx, 'filetags_tag', { paths: [note], tags: ['draft'] })).toEqual({ value: { tagged: 1 } })

    const searched = await call(ctx, 'filetags_search', { expression: 'work and not archive' })
    expect(searched.value).toEqual({ entries: [
      { path: project, isDir: true, tags: ['work'] },
      { path: note, isDir: false, tags: ['draft', 'work'] },
    ] })

    expect(await call(ctx, 'filetags_list', {})).toEqual({ value: { tags: [
      { name: 'archive', count: 1 }, { name: 'draft', count: 1 }, { name: 'work', count: 2 },
    ] } })
    expect(await call(ctx, 'filetags_list', { path: note })).toEqual({ value: {
      entry: { path: note, isDir: false, tags: ['draft', 'work'] },
    } })

    expect(await call(ctx, 'filetags_untag', { paths: [note], tags: ['draft', 'work'] })).toEqual({ value: { removed: 2 } })
    expect(await call(ctx, 'filetags_list', { path: note })).toEqual({ value: { tags: [] } })
    expect(await readdir(project)).toEqual(['note.md'])
    expect(await readdir(archive)).toEqual([])
  }, 30_000)

  it('rejects relative paths, reserved tag names, and malformed expressions as tool argument errors', async () => {
    const { ctx, base } = await boot()
    const note = join(base, 'note.md')
    await writeFile(note, 'hello')

    expect(await call(ctx, 'filetags_tag', { paths: ['note.md'], tags: ['work'] })).toMatchObject({ error: expect.stringContaining('paths must be absolute') })
    expect(await call(ctx, 'filetags_tag', { paths: [note], tags: ['and'] })).toMatchObject({ error: expect.stringContaining('reserved for queries') })
    expect(await call(ctx, 'filetags_search', { expression: 'work and (draft' })).toMatchObject({ error: expect.stringContaining('ends unexpectedly') })
  }, 30_000)

  it('removes the tools when the plugin fiber is disposed', async () => {
    const { ctx } = await boot()
    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === 'cordis:@deepseek-ai/dsh-filetags')
    await entry!.fiber!.dispose()
    expect(ctx.tools.schemas().some(tool => tool.name.startsWith('filetags_'))).toBe(false)
  }, 30_000)
})
