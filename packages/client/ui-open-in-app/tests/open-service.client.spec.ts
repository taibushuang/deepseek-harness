/** The shared opening surface: desktop availability once per page, then open and reveal outcomes. */

import { describe, expect, it, vi } from 'vitest'
import type { SessionOpenWorkspacePathRequest } from '@deepseek-ai/dsh-api-session-controller/types'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { OpenInAppPathController, type OpenInAppPathRemote } from '../src/client/open-path.ts'
import { OpenInAppService } from '../src/client/service.ts'

function remoteOf(over: Partial<OpenInAppPathRemote['session']> = {}): OpenInAppPathRemote {
  return {
    session: {
      workspacePathApplications: async () => ({ ok: true, value: [] }),
      canOpenWorkspacePath: async () => ({ ok: true, value: true }),
      openWorkspacePath: async () => ({ ok: true, value: { opened: true } }),
      ...over,
    },
  }
}

describe('OpenInAppService', () => {
  it('reports a desktop only after the Host confirms it', async () => {
    const service = new OpenInAppService(new OpenInAppPathController(remoteOf()))
    expect(await service.available()).toBe(true)

    const web = new OpenInAppService(new OpenInAppPathController(remoteOf({
      canOpenWorkspacePath: async () => ({ ok: true, value: false }),
    })))
    expect(await web.available()).toBe(false)
  })

  it('opens and reveals absolute paths through the same carrier the file controls use', async () => {
    const openWorkspacePath = vi.fn(async (_request: SessionOpenWorkspacePathRequest) => ({ ok: true as const, value: {} }))
    const service = new OpenInAppService(new OpenInAppPathController(remoteOf({ openWorkspacePath })))
    expect(await service.open('/home/me/notes.md')).toEqual({ kind: 'opened' })
    expect(await service.reveal('/home/me/notes.md')).toEqual({ kind: 'revealed' })
    expect(openWorkspacePath.mock.calls.map(([request]) => request)).toEqual([
      { path: '/home/me/notes.md' },
      { path: '/home/me/notes.md', action: 'reveal' },
    ])
  })

  it('names the failed gesture when the Host refuses the open', async () => {
    const service = new OpenInAppService(new OpenInAppPathController(remoteOf({
      openWorkspacePath: async () => ({ ok: false, error: new RemoteError('gateway/internal', 'refused', {}) }),
    })))
    expect(await service.open('/home/me/notes.md')).toEqual({ kind: 'failed', failure: 'openError' })
    expect(await service.reveal('/home/me/notes.md')).toEqual({ kind: 'failed', failure: 'revealError' })
  })
})
