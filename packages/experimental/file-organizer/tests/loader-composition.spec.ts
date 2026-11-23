/** The organizer tools through a real Loader composition: preview, apply, undo, history, and disposal. */
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, type SessionId } from '@deepseek-ai/dsh-session'
import { unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import * as FileOrganizer from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot the organizer through a real cordis.yml.
 * @returns the context and the temporary root.
 */
async function boot(): Promise<{ ctx: Context; base: string }> {
  root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-organizer-loader-')))
  const base = root
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-executor-native', NativeToolExecutor],
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-working-directory', WorkingDirectory],
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', StorageJson],
    ['@deepseek-ai/dsh-storage-domain', StorageDomain],
    ['@deepseek-ai/dsh-file-organizer', FileOrganizer],
  ])
  const config = [...modules.keys()].flatMap(name => [
    `- name: 'cordis:${name}'`,
    ...name === '@deepseek-ai/dsh-fs-local' ? ['  config:', `    cwd: '${base}'`] : [],
    ...name === '@deepseek-ai/dsh-working-directory' ? ['  config:', `    defaultDirectory: '${base}'`] : [],
    ...name === '@deepseek-ai/dsh-storage-json' ? ['  config:', `    root: '${join(base, '.storage')}'`] : [],
    ...name === '@deepseek-ai/dsh-storage-domain' ? ['  config:', '    backend: json'] : [],
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
 * Execute one organizer tool.
 * @param ctx - booted context.
 * @param name - tool name.
 * @param args - arguments.
 * @returns the structured value or failure text.
 */
async function call(
  ctx: Context, name: string, args: Record<string, unknown>, agent?: Agent,
): Promise<{ value?: Record<string, unknown>; error?: string }> {
  const result = await executeToolFixture(ctx, {
    name, callId: brandString<ToolCallId>(name), arguments: args, signal: new AbortController().signal,
    ...agent === undefined ? {} : { agent },
  })
  if (result.isError) return { error: result.content.map(block => ('text' in block ? block.text : '')).join('') }
  return { value: result.value as Record<string, unknown> }
}

/**
 * Build a stand-in Agent whose Session resolves through the working-directory service.
 * @returns the agent.
 */
function makeAgent(ctx: Context): Agent {
  const scope = ctx.plugin(() => {})
  const id = brandString<SessionId>('organizer-agent')
  const session = Session.create(id)
  return {
    id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(),
    status: 'idle', ctx: scope.ctx,
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

describe('file-organizer real Loader composition', () => {
  it('previews, applies, undoes, and lists history', async () => {
    const { ctx, base } = await boot()
    expect(ctx.tools.schemas().map(tool => tool.name).sort()).toEqual([
      'organize_apply', 'organize_history', 'organize_preview', 'organize_undo',
    ])

    const inbox = join(base, 'inbox')
    await mkdir(inbox)
    await writeFile(join(inbox, 'a.pdf'), 'a')
    await writeFile(join(inbox, 'b.png'), 'b')
    await writeFile(join(inbox, 'c.txt'), 'c')
    const relativePreview = await call(ctx, 'organize_preview', {
      directory: 'inbox',
      rules: [
        { pattern: '*.pdf', target: 'documents', tags: ['work'] },
        { pattern: '*.png', target: 'images' },
      ],
      others_target: 'other',
    }, makeAgent(ctx))
    if (relativePreview.value === undefined) throw new Error(String(relativePreview.error))
    const preview = await call(ctx, 'organize_preview', {
      directory: 'inbox',
      rules: [
        { pattern: '*.pdf', target: 'documents', tags: ['work'] },
        { pattern: '*.png', target: 'images' },
      ],
      others_target: 'other',
    })
    if (preview.value === undefined) throw new Error(String(preview.error))
    expect(preview.value.total_moves).toBe(3)
    const batchId = String(preview.value.batch_id)

    expect((await call(ctx, 'organize_apply', { batch_id: batchId, confirm: false })).error)
      .toContain('confirm must be true')
    const applied = await call(ctx, 'organize_apply', { batch_id: batchId, confirm: true })
    expect(applied.value).toMatchObject({ status: 'applied', done: 3, failed: 0 })
    expect(await readFile(join(inbox, 'documents', 'a.pdf'), 'utf8')).toBe('a')

    const undone = await call(ctx, 'organize_undo', { batch_id: batchId })
    expect(undone.value).toMatchObject({ status: 'undone', done: 3 })
    expect(await readFile(join(inbox, 'a.pdf'), 'utf8')).toBe('a')

    const history = await call(ctx, 'organize_history', {})
    expect((history.value?.batches as unknown[]).length).toBe(2)

    // A batch whose destination appears after preview applies partially and reports the reason.
    await writeFile(join(inbox, 'd.pdf'), 'd')
    const partialPlan = await call(ctx, 'organize_preview', { directory: 'inbox', rules: [{ pattern: '*.pdf', target: 'documents' }] })
    const partialId = String(partialPlan.value?.batch_id)
    await writeFile(join(inbox, 'documents', 'd.pdf'), 'blocked')
    const partial = await call(ctx, 'organize_apply', { batch_id: partialId, confirm: true })
    expect(partial.value).toMatchObject({ status: 'partial', failed: 1 })
    expect((await call(ctx, 'organize_undo', { batch_id: partialId })).value).toMatchObject({ status: 'undone' })

    // An applied batch whose original path is occupied undoes partially.
    await writeFile(join(inbox, 'e.pdf'), 'e')
    const occupiedPlan = await call(ctx, 'organize_preview', { directory: 'inbox', rules: [{ pattern: '*.pdf', target: 'documents' }] })
    const occupiedId = String(occupiedPlan.value?.batch_id)
    await call(ctx, 'organize_apply', { batch_id: occupiedId, confirm: true })
    await writeFile(join(inbox, 'e.pdf'), 'occupied')
    expect((await call(ctx, 'organize_undo', { batch_id: occupiedId })).value).toMatchObject({ status: 'undoPartial', failed: 1 })

    // A scheduled inbox pass routes from one directory into another tree and tags the moved files.
    const secondInbox = join(base, 'inbox2')
    const library = join(base, 'library')
    await mkdir(secondInbox)
    await mkdir(library)
    await writeFile(join(secondInbox, 'f.md'), 'f')
    await writeFile(join(secondInbox, 'g.bin'), 'g')
    const routed = await call(ctx, 'organize_preview', {
      directory: 'inbox2',
      destination_root: 'library',
      rules: [{ pattern: '*.md', target: 'notes', tags: ['note'] }],
      others_target: 'unsorted',
      others_tags: ['triage'],
    })
    expect(routed.value?.total_moves).toBe(2)
    const routedApplied = await call(ctx, 'organize_apply', { batch_id: String(routed.value?.batch_id), confirm: true })
    expect(routedApplied.value).toMatchObject({ status: 'applied', done: 2 })
    expect(await readFile(join(library, 'notes', 'f.md'), 'utf8')).toBe('f')
    expect(await readFile(join(library, 'unsorted', 'g.bin'), 'utf8')).toBe('g')

    expect((await call(ctx, 'organize_preview', {
      directory: 'inbox2',
      destination_root: 'missing-library',
      rules: [{ pattern: '*', target: 'x' }],
    })).error).toContain('does not exist')
    expect((await call(ctx, 'organize_preview', { directory: 'missing', rules: [{ pattern: '*', target: 'x' }] })).error)
      .toContain('does not exist')
    expect((await call(ctx, 'organize_preview', { directory: ' ', rules: [] })).error)
      .toContain('directory must be a non-empty string')
    expect((await call(ctx, 'organize_apply', { batch_id: 'missing', confirm: true })).error)
      .toContain('was not found')

    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === 'cordis:@deepseek-ai/dsh-file-organizer')
    await entry!.fiber!.dispose()
    expect(ctx.tools.schemas().some(tool => tool.name.startsWith('organize_'))).toBe(false)
  }, 30_000)
})
