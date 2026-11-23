/** The transfer tools through the real tool runtime and local provider. */
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, type SessionId } from '@deepseek-ai/dsh-session'
import { unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as ToolTransfer from '../src/index.ts'

let dir: string
let ctx: Context
let fiber: Awaited<ReturnType<Context['plugin']>>

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-transfer-tool-')))
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(WorkingDirectory, { defaultDirectory: dir })
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  fiber = await ctx.plugin(ToolTransfer)
})
afterEach(async () => {
  await fiber.dispose()
  await ctx.fiber.dispose()
  await rm(dir, { recursive: true, force: true })
})

/**
 * Execute one transfer tool.
 * @param name - tool name.
 * @param args - arguments.
 * @returns the structured value or the failure text.
 */
async function call(
  name: string, args: Record<string, unknown>, agent?: Agent,
): Promise<{ value?: unknown; error?: string }> {
  const result = await executeToolFixture(ctx, {
    name, callId: brandString<ToolCallId>(`${name}-call`), arguments: args, signal: new AbortController().signal,
    ...agent === undefined ? {} : { agent },
  })
  if (result.isError) return { error: result.content.map(block => ('text' in block ? block.text : '')).join('') }
  return { value: result.value }
}

/**
 * Build a stand-in Agent whose Session resolves through the working-directory service.
 * @returns the agent.
 */
function makeAgent(): Agent {
  const scope = ctx.plugin(() => {})
  const id = brandString<SessionId>('transfer-tool-agent')
  const session = Session.create(id)
  return {
    id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(),
    status: 'idle', ctx: scope.ctx,
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

describe('transfer tools', () => {
  it('copies and moves binary files without overwriting', async () => {
    await writeFile(join(dir, 'source.bin'), Buffer.from([0, 255, 7]))
    await mkdir(join(dir, 'nested'))
    expect((await call('fs_copy', {
      source_path: 'source.bin', destination_path: 'nested/copy.bin',
    })).value).toMatchObject({ operation: 'create', size: 3, destination: join(dir, 'nested', 'copy.bin') })
    expect(await readFile(join(dir, 'nested', 'copy.bin'))).toEqual(Buffer.from([0, 255, 7]))

    expect((await call('fs_move', {
      source_path: 'nested/copy.bin', destination_path: 'moved.bin',
    })).value).toMatchObject({ operation: 'create', size: 3, sourceDeleted: true })
    await expect(stat(join(dir, 'nested', 'copy.bin'))).rejects.toMatchObject({ code: 'ENOENT' })

    expect((await call('fs_copy', {
      source_path: 'source.bin', destination_path: 'moved.bin',
    })).error).toContain('already exists')
  })

  it('resolves relative paths through the calling agent directory', async () => {
    await writeFile(join(dir, 'relative.bin'), Buffer.from([5]))
    const result = await call('fs_copy', { source_path: 'relative.bin', destination_path: 'relative-copy.bin' }, makeAgent())
    expect(result.error).toBeUndefined()
    expect(await readFile(join(dir, 'relative-copy.bin'))).toEqual(Buffer.from([5]))
  })

  it('reports a retained source when only the destination commits', async () => {
    await writeFile(join(dir, 'source.bin'), Buffer.from([1]))
    ;(ctx.fs as LocalFileSystem).internals.removeFile = async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) }
    const result = await call('fs_move', { source_path: 'source.bin', destination_path: 'moved.bin' })
    expect(result.error).toBeUndefined()
    expect((result.value as { sourceDeleted?: boolean }).sourceDeleted).toBe(false)
    expect(JSON.stringify(result.value)).toContain('FS_PERMISSION_DENIED')
  })

  it('rejects blank paths, missing sources, and escalation without a sandbox', async () => {
    expect((await call('fs_copy', { source_path: ' ', destination_path: 'b.bin' })).error).toContain('source_path must be a non-empty string')
    expect((await call('fs_move', { source_path: 'a.bin', destination_path: '' })).error).toContain('destination_path must be a non-empty string')
    expect((await call('fs_copy', { source_path: 'missing.bin', destination_path: 'b.bin' })).error)
      .toContain('file changed since it was read')
    expect((await call('fs_copy', {
      source_path: 'missing.bin', destination_path: 'b.bin', sandbox_permissions: 'danger-full-access', justification: 'outside',
    })).error).toContain('not available in this composition')
  })
})
