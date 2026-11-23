/** office_text through a real Loader composition: registration, formats, caps, and disposal. */
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
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
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, type SessionId } from '@deepseek-ai/dsh-session'
import { unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { workbook } from './fixtures.ts'
import * as OfficeText from '../src/index.ts'
import { docx, paragraph, pdf } from './fixtures.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot the extraction tool through a real cordis.yml.
 * @returns the context and the temporary root.
 */
async function boot(): Promise<{ ctx: Context; base: string }> {
  root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-office-text-loader-')))
  const base = root
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-executor-native', NativeToolExecutor],
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-working-directory', WorkingDirectory],
    ['@deepseek-ai/dsh-office-text', OfficeText],
  ])
  const config = [...modules.keys()].flatMap(name => [
    `- name: 'cordis:${name}'`,
    ...name === '@deepseek-ai/dsh-fs-local' ? ['  config:', `    cwd: '${base}'`] : [],
    ...name === '@deepseek-ai/dsh-working-directory' ? ['  config:', `    defaultDirectory: '${base}'`] : [],
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
 * Execute office_text and return the structured value or failure text.
 * @param ctx - booted context.
 * @param args - tool arguments.
 * @returns the value or failure.
 */
async function call(
  ctx: Context, args: Record<string, unknown>, agent?: Agent,
): Promise<{ value?: Record<string, unknown>; error?: string }> {
  const result = await executeToolFixture(ctx, {
    name: 'office_text', callId: brandString<ToolCallId>('office-text'),
    arguments: args, signal: new AbortController().signal,
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
  const id = brandString<SessionId>('office-text-agent')
  const session = Session.create(id)
  return {
    id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(),
    status: 'idle', ctx: scope.ctx,
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

describe('office-text real Loader composition', () => {
  it('reads Word, PDF, and the service, then withdraws the tool', async () => {
    const { ctx, base } = await boot()
    expect(ctx.tools.schemas().map(tool => tool.name)).toContain('office_text')
    expect(ctx.officeText).toBeDefined()

    await writeFile(join(base, 'letter.docx'), docx(paragraph('Dear team')))
    const word = await call(ctx, { path: 'letter.docx' })
    expect(word.error).toBeUndefined()
    expect(word.value).toMatchObject({ format: 'docx', text: 'Dear team', truncated: false })
    expect(String(word.value?.path)).toBe(join(base, 'letter.docx'))

    await writeFile(join(base, 'note.pdf'), pdf('PDF body'))
    const pdfResult = await call(ctx, { path: 'note.pdf' })
    if (pdfResult.value === undefined) throw new Error(`pdf failed: ${String(pdfResult.error)}`)
    expect(pdfResult.value).toMatchObject({ format: 'pdf', text: 'PDF body', pages: 1 })

    await writeFile(join(base, 'tasks.xlsx'), await workbook([['Task'], ['Ship']], 'Plan'))
    expect((await call(ctx, { path: 'tasks.xlsx' })).value).toMatchObject({ format: 'xlsx', sheets: ['Plan'] })

    const relative = await call(ctx, { path: 'letter.docx' }, makeAgent(ctx))
    expect(relative.error).toBeUndefined()

    const truncated = await call(ctx, { path: 'letter.docx', max_chars: 4 })
    expect(truncated.value).toMatchObject({ text: 'Dear', truncated: true })
    expect((await call(ctx, { path: 'letter.docx', max_chars: 0 })).error).toContain('max_chars must be a positive integer')
    expect((await call(ctx, { path: ' ' })).error).toContain('path must be a non-empty string')
    expect((await call(ctx, { path: 'missing.docx' })).error).toContain('file not found')

    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === 'cordis:@deepseek-ai/dsh-office-text')
    await entry!.fiber!.dispose()
    expect(ctx.tools.schemas().some(tool => tool.name === 'office_text')).toBe(false)
  }, 30_000)
})


describe('office-text configuration', () => {
  it('rejects a default above its cap at load time', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'dsh-office-text-config-')))
    try {
      const baseConfig = { maxBytes: 1024, maxChars: 10, maxCharsCap: 100, maxPages: 10, maxPagesCap: 100 }
      const message = async (config: typeof baseConfig): Promise<string> => {
        const ctx = new Context()
        await ctx.plugin(SystemPrompt)
        await ctx.plugin(ToolRuntime)
        await ctx.plugin(LocalFileSystem, { cwd: base })
        await ctx.plugin(SessionProjectionRegistry)
        await ctx.plugin(WorkingDirectory, { defaultDirectory: base })
        try {
          await ctx.plugin(OfficeText, config)
          return 'resolved'
        } catch (error: unknown) {
          return error instanceof Error ? error.message : String(error)
        } finally {
          await ctx.fiber.dispose()
        }
      }
      expect(await message({ ...baseConfig, maxChars: 5, maxCharsCap: 1 })).toContain('maxChars must not exceed maxCharsCap')
      expect(await message({ ...baseConfig, maxPages: 300, maxPagesCap: 200 })).toContain('maxPages must not exceed maxPagesCap')
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
