// @vitest-environment jsdom
/** File-organizer card body: apply, undo, status, and refusal copy. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ActionCardId } from '@deepseek-ai/dsh-action-cards/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ActionCardBodyProps } from '@deepseek-ai/dsh-client-ui-action-cards/client'
import type {} from '../src/client/mount.ts'
import { OrganizerCardBody } from '../src/client/Card.tsx'
import { dictionaries, type FileOrganizerKey } from '../src/client/locales.ts'

afterEach(cleanup)

const details = { batchId: 'batch-1', directory: '/inbox', totalMoves: 3, totalSkipped: 1 }
const proposal = {
  cardId: brandString<ActionCardId>('card-1'),
  turn: 1,
  action: 'organize_files',
  title: 'Organize inbox',
  brief: 'Move three files',
  details,
}
const t: ActionCardBodyProps<'fileOrganizer'>['t'] = (key, params) => {
  const text = dictionaries.en[key as FileOrganizerKey] ?? String(key)
  return params === undefined ? text : text.replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params[name] ?? ''))
}

function body(decision?: ActionCardBodyProps<'fileOrganizer'>['decision']) {
  const act = vi.fn(async () => ({ status: 'settled' as const, decision: {
    cardId: proposal.cardId, action: 'organize_files', phase: 'applied', data: { done: 3, failed: 0 },
  } }))
  const props: ActionCardBodyProps<'fileOrganizer'> = {
    proposal,
    decision,
    sessionId: brandString<SessionId>('session-1'),
    summary: null,
    fallback: <span>fallback</span>,
    Folded: () => null,
    act,
    t,
  }
  return { act, ...render(<OrganizerCardBody {...props} />) }
}

describe('file-organizer card body', () => {
  it('shows the batch summary and sends apply', async () => {
    const view = body()
    expect(view.getByText('3 files → /inbox')).toBeTruthy()
    expect(view.getByText('1 skipped')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Apply' }))
    expect(view.act).toHaveBeenCalledWith('apply')
  })

  it('offers undo after an applied batch and reports a partial phase', () => {
    const view = body({
      cardId: proposal.cardId,
      action: 'organize_files',
      phase: 'partial',
      data: { done: 2, failed: 1 },
    })
    expect(view.getByText(/Partially applied/)).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Undo' }))
    expect(view.act).toHaveBeenCalledWith('undo')
  })

  it('uses the frame fallback when details do not match', () => {
    const props: ActionCardBodyProps<'fileOrganizer'> = {
      proposal: { ...proposal, details: { batchId: 1 } },
      decision: undefined,
      sessionId: brandString<SessionId>('session-1'),
      summary: null,
      fallback: <span>fallback</span>,
      Folded: () => null,
      act: vi.fn(),
      t,
    }
    const view = render(<OrganizerCardBody {...props} />)
    expect(view.getByText('fallback')).toBeTruthy()
  })
})
