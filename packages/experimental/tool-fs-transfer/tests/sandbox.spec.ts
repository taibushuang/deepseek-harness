/** The transfer sandbox surface: advertisement, policy stamping, approval, and denial mapping. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { FsError } from '@deepseek-ai/dsh-fs'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { Session, type SessionId } from '@deepseek-ai/dsh-session'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import { unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { TransferCall } from '../src/sandbox.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ToolTransfer from '../src/index.ts'
import { TransferSandbox } from '../src/sandbox.ts'

let dir: string
let ctx: Context
let fiber: Awaited<ReturnType<Context['plugin']>>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-transfer-sandbox-'))
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(SandboxedFileSystem, { cwd: dir })
  await ctx.plugin(WorkingDirectory, { defaultDirectory: dir })
  fiber = await ctx.plugin(ToolTransfer)
})
afterEach(async () => {
  await fiber.dispose()
  await ctx.fiber.dispose()
  await rm(dir, { recursive: true, force: true })
})

/**
 * Build the minimum Agent shape escalation reads (`session`) and approval passes through.
 * @returns the stand-in agent.
 */
function agent(): Agent {
  const scope = ctx.plugin(() => {})
  const id = brandString<SessionId>('transfer-sandbox')
  const session = Session.create(id)
  return {
    id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(),
    status: 'idle', ctx: scope.ctx,
    followup: () => {}, steer: () => {}, inject: () => {}, send: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

/**
 * Build a tool-execution view the sandbox policy resolver needs.
 * @param value - agent for the call, or undefined for an agentless call.
 * @returns the execution stand-in.
 */
function execution(value?: Agent): TransferCall {
  return {
    callId: brandString<ToolCallId>('copy-call'),
    signal: new AbortController().signal,
    ...value === undefined ? {} : { agent: value },
  }
}

describe('TransferSandbox', () => {
  it('advertises escalation only under a confining filesystem', () => {
    const confined = new TransferSandbox('workspace-write', ctx.sandboxPolicy, undefined)
    expect(confined.escalationModes.length).toBeGreaterThan(0)
    expect(confined.schemaFields().sandbox_permissions.enum).toEqual([...confined.escalationModes])

    const bare = new TransferSandbox(undefined, undefined, undefined)
    expect(bare.escalationModes).toEqual([])
  })

  it('advertises the escalation fields on both tools under a confining filesystem', () => {
    for (const name of ['fs_copy', 'fs_move']) {
      const schema = ctx.tools.schemas().find(tool => tool.name === name)
      expect(JSON.stringify(schema?.parameters)).toContain('sandbox_permissions')
      expect(JSON.stringify(schema?.parameters)).toContain('justification')
    }
  })

  it('fails loudly when a confining filesystem has no policy service', () => {
    expect(() => new TransferSandbox('workspace-write', undefined, undefined))
      .toThrow('the mounted filesystem confines but ctx.sandboxPolicy is missing')
  })

  it('stamps the standing policy and rejects escalation without a sandbox', async () => {
    const sandbox = new TransferSandbox('workspace-write', ctx.sandboxPolicy, undefined)
    expect((await sandbox.resolvePolicy('fs_copy', {}, execution()))?.mode).toBe('workspace-write')
    await expect(sandbox.resolvePolicy('fs_copy', { justification: 'why' }, execution()))
      .rejects.toThrow('justification is only valid together with sandbox_permissions')

    const bare = new TransferSandbox(undefined, undefined, undefined)
    await expect(bare.resolvePolicy('fs_copy', { sandbox_permissions: 'danger-full-access', justification: 'why' }, execution()))
      .rejects.toThrow('not available in this composition')
  })

  it('repeats the standing mode without approval and rejects a justification alone', async () => {
    const approver = { request: vi.fn(async () => 'allowed-once' as const) }
    const sandbox = new TransferSandbox('workspace-write', ctx.sandboxPolicy, approver)
    expect((await sandbox.resolvePolicy('fs_copy', { sandbox_permissions: 'workspace-write' }, execution(agent())))?.mode)
      .toBe('workspace-write')
    expect(approver.request).not.toHaveBeenCalled()
    await expect(sandbox.resolvePolicy('fs_copy', { justification: 'why' }, execution(agent())))
      .rejects.toThrow('justification is only valid together with sandbox_permissions')
    expect((await sandbox.resolvePolicy('fs_copy', { justification: '   ' }, execution(agent())))?.mode)
      .toBe('workspace-write')
  })

  it('asks for approval before a strictly wider mode and fails closed without one', async () => {
    const value = agent()
    const withoutApprover = new TransferSandbox('workspace-write', ctx.sandboxPolicy, undefined)
    await expect(withoutApprover.resolvePolicy('fs_copy', {
      sandbox_permissions: 'danger-full-access', justification: 'outside the workspace',
    }, execution(value))).rejects.toThrow('no approval service is composed')

    const approver = { request: vi.fn(async () => 'allowed-once' as const) }
    const sandbox = new TransferSandbox('workspace-write', ctx.sandboxPolicy, approver)
    expect((await sandbox.resolvePolicy('fs_copy', {
      sandbox_permissions: 'danger-full-access', justification: 'outside the workspace',
    }, execution(value)))?.mode).toBe('danger-full-access')
    expect(approver.request).toHaveBeenCalledOnce()
  })

  it('marks a sandbox denial with the shared hint and passes other failures through', () => {
    const sandbox = new TransferSandbox('workspace-write', ctx.sandboxPolicy, undefined)
    const policy = { mode: 'workspace-write' as const, workspaceRoot: dir }
    const denied = new FsError('denied by policy', 'FS_SANDBOX_DENIED')
    const mapped = sandbox.mapError(denied, policy)
    expect(mapped).toBeInstanceOf(FsError)
    expect((mapped as FsError).code).toBe('FS_SANDBOX_DENIED')
    expect((mapped as FsError).message).toContain('[sandbox: file access denied under workspace-write mode]')
    expect((mapped as FsError).message).toContain('escalation available')

    const stale = new FsError('stale', 'FS_STALE_VERSION')
    expect(sandbox.mapError(stale, policy)).toBe(stale)
    expect(sandbox.mapError(new Error('other'), policy)).toBeInstanceOf(Error)
  })
})
