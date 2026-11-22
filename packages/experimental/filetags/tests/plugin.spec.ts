/**
 * The central store through both faces: the four model tools and the `fileTags`
 * Remote methods share one database, reject the same malformed input, and close
 * it when the plugin unloads.
 */
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import FileTags from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot the plugin over a fresh database with the real tool runtime and Typert registry.
 * @param databasePath - database file to open; defaults to one under the temporary root.
 * @returns the context, the temporary root, and the database path.
 */
async function boot(databasePath?: string): Promise<{ ctx: Context; base: string; db: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-filetags-plugin-'))
  const base = root
  const db = databasePath ?? join(base, 'state', 'filetags.db')
  const ctx = new Context()
  context = ctx
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(FileTags, { path: db })
  return { ctx, base, db }
}

/**
 * Execute one model tool and return its structured value or failure text.
 * @param ctx - booted context.
 * @param name - tool name.
 * @param args - tool arguments.
 * @returns the value or the failure message.
 */
async function tool(ctx: Context, name: string, args: Record<string, unknown>): Promise<{ value?: unknown; error?: string }> {
  const result = await executeToolFixture(ctx, {
    name, callId: brandString<ToolCallId>(`${name}-call`), arguments: args, signal: new AbortController().signal,
  })
  if (result.isError) return { error: result.content.map(block => ('text' in block ? block.text : '')).join('') }
  return { value: result.value }
}

describe('filetags plugin faces', () => {
  it('serves the same database through the model tools and the Remote methods', async () => {
    const { ctx, base } = await boot()
    const project = join(base, 'project')
    await mkdir(project)
    const note = join(project, 'note.md')
    await writeFile(note, 'hello')
    const signal = new AbortController().signal

    expect((await tool(ctx, 'filetags_tag', { paths: [project, note], tags: ['work'] })).value).toEqual({ tagged: 2 })
    expect((await tool(ctx, 'filetags_list', {})).value).toEqual({ tags: [{ name: 'work', count: 2 }] })
    expect((await tool(ctx, 'filetags_list', { path: note })).value).toEqual({
      entry: { path: note, isDir: false, tags: ['work'] },
    })
    expect((await tool(ctx, 'filetags_search', { expression: 'work' })).value).toEqual({
      entries: [{ path: note, isDir: false, tags: ['work'] }, { path: project, isDir: true, tags: ['work'] }].sort((a, b) => a.path.localeCompare(b.path)),
    })
    expect(await ctx.fileTags.listTags(signal)).toEqual([{ name: 'work', count: 2 }])
    expect(await ctx.fileTags.search({ expression: 'work' }, signal)).toHaveLength(2)
    expect(await ctx.fileTags.entry({ path: note }, signal)).toEqual({ path: note, isDir: false, tags: ['work'] })
    expect(await ctx.fileTags.entry({ path: join(base, 'absent') }, signal)).toBeNull()
    expect(await ctx.fileTags.tag({ paths: [note], tags: ['draft'] }, signal)).toBe(1)
    expect(await ctx.fileTags.untag({ paths: [note], tags: ['draft', 'work'] }, signal)).toBe(2)
    expect(await ctx.fileTags.listTags(signal)).toEqual([{ name: 'work', count: 1 }])
    expect((await tool(ctx, 'filetags_list', { path: join(base, 'absent') })).value).toEqual({ tags: [] })
  })

  it('caps a browser search at the Host limit and keeps at least one row', async () => {
    const { ctx, base } = await boot()
    const signal = new AbortController().signal
    for (let index = 0; index < 3; index += 1) {
      const file = join(base, `file-${index}.txt`)
      await writeFile(file, 'x')
      await ctx.fileTags.tag({ paths: [file], tags: ['bulk'] }, signal)
    }
    expect(await ctx.fileTags.search({ expression: 'bulk', limit: 0 }, signal)).toHaveLength(1)
    expect(await ctx.fileTags.search({ expression: 'bulk', limit: 5000 }, signal)).toHaveLength(3)
  })

  it('reports malformed input as tool arguments and as Remote invalid-argument failures', async () => {
    const { ctx, base } = await boot()
    const signal = new AbortController().signal
    const note = join(base, 'note.md')
    await writeFile(note, 'hello')

    expect((await tool(ctx, 'filetags_tag', { paths: ['note.md'], tags: ['work'] })).error).toContain('paths must be absolute')
    expect((await tool(ctx, 'filetags_untag', { paths: ['note.md'], tags: ['work'] })).error).toContain('paths must be absolute')
    expect((await tool(ctx, 'filetags_tag', { paths: [note], tags: ['two words'] })).error).toContain('invalid tag name')
    expect((await tool(ctx, 'filetags_search', { expression: 'work and' })).error).toContain('ends unexpectedly')
    expect((await tool(ctx, 'filetags_list', { path: 'note.md' })).error).toContain('paths must be absolute')

    await expect(ctx.fileTags.tag({ paths: ['note.md'], tags: ['work'] }, signal)).rejects.toMatchObject({ code: 'filetags/invalid-argument' })
    await expect(ctx.fileTags.untag({ paths: ['note.md'], tags: ['work'] }, signal)).rejects.toMatchObject({ code: 'filetags/invalid-argument' })
    await expect(ctx.fileTags.tag({ paths: [note], tags: ['and'] }, signal)).rejects.toMatchObject({ code: 'filetags/invalid-argument' })
    await expect(ctx.fileTags.search({ expression: '(work' }, signal)).rejects.toMatchObject({ code: 'filetags/invalid-argument' })
    await expect(ctx.fileTags.entry({ path: 'note.md' }, signal)).rejects.toMatchObject({ code: 'filetags/invalid-argument' })
  })

  it('reports a store failure as a Remote failure and lets the model tool fail with the filesystem message', async () => {
    const { ctx, base } = await boot()
    const signal = new AbortController().signal
    const absent = join(base, 'absent.txt')
    await expect(ctx.fileTags.tag({ paths: [absent], tags: ['work'] }, signal)).rejects.toMatchObject({ code: 'filetags/failed' })
    expect((await tool(ctx, 'filetags_tag', { paths: [absent], tags: ['work'] })).error).toContain('ENOENT')
  })

  it('closes the database with the plugin after use and without ever opening it', async () => {
    const used = await boot()
    const note = join(used.base, 'note.md')
    await writeFile(note, 'hello')
    await used.ctx.fileTags.tag({ paths: [note], tags: ['work'] }, new AbortController().signal)
    await used.ctx.fiber.dispose()
    context = undefined
    const unusedRoot = await mkdtemp(join(tmpdir(), 'dsh-filetags-unused-'))
    try {
      const ctx = new Context()
      context = ctx
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(TypertRegistry)
      await ctx.plugin(FileTags, { path: join(unusedRoot, 'filetags.db') })
      await ctx.fiber.dispose()
      context = undefined
    } finally {
      await rm(unusedRoot, { recursive: true, force: true })
    }
  })

  it('closes without waiting for an open that failed while unloading', async () => {
    const blocker = await mkdtemp(join(tmpdir(), 'dsh-filetags-dispose-'))
    try {
      const file = join(blocker, 'file')
      await writeFile(file, 'x')
      const { ctx } = await boot(join(file, 'filetags.db'))
      const pending = ctx.fileTags.listTags(new AbortController().signal).catch(() => undefined)
      await ctx.fiber.dispose()
      context = undefined
      await pending
    } finally {
      await rm(blocker, { recursive: true, force: true })
    }
  })

  it('retries the database open after a failed attempt', async () => {
    const blocker = await mkdtemp(join(tmpdir(), 'dsh-filetags-blocker-'))
    try {
      const file = join(blocker, 'file')
      await writeFile(file, 'x')
      const { ctx } = await boot(join(file, 'filetags.db'))
      const signal = new AbortController().signal
      await expect(ctx.fileTags.listTags(signal)).rejects.toMatchObject({ code: 'filetags/failed' })
      await rm(file)
      await mkdir(file)
      await writeFile(join(file, 'unused'), 'x')
      expect(await ctx.fileTags.listTags(signal)).toEqual([])
    } finally {
      await rm(blocker, { recursive: true, force: true })
    }
  })
})
