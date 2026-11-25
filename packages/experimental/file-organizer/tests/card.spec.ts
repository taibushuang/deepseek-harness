/** The organizer action-card kind: apply, undo, refusal, and failure recording. */
import { describe, expect, it, vi } from 'vitest'
import { registerOrganizerCard } from '../src/card.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ActionCardDecision, ActionCardId, ActionCards } from '@deepseek-ai/dsh-action-cards'
import type { BatchResult } from '../src/service.ts'

const proposal = {
  cardId: brandString<ActionCardId>('card-1'),
  turn: 1,
  action: 'organize_files',
  title: 'Organize inbox',
  brief: 'Move three files',
  details: { batchId: 'batch-1', directory: '/inbox', totalMoves: 3, totalSkipped: 0 },
}

function harness(result: BatchResult = { status: 'applied', done: 3, failed: 0, outcomes: [], batchId: 'batch-1' }) {
  const registered: unknown[] = []
  const records: ActionCardDecision[] = []
  let decision: ActionCardDecision | undefined
  const actionCards: Pick<ActionCards, 'register' | 'view' | 'record'> = {
    register(kind) { registered.push(kind); return () => {} },
    view: () => ({ proposals: {}, decisions: decision === undefined ? {} : { 'card-1': decision } }),
    record(_agent, next) { decision = next; records.push(next) },
  }
  const applyMock = vi.fn(async () => result)
  const undoMock = vi.fn(async () => ({ status: 'undone', done: 3, failed: 0, outcomes: [], batchId: 'batch-1' } as BatchResult))
  const organizer = { apply: applyMock, undo: undoMock }
  registerOrganizerCard(actionCards, organizer)
  const kind = registered[0] as {
    details: { parse: (value: unknown) => unknown }
    act: (agent: unknown, proposal: unknown, verb: string) => Promise<{ status: string; decision?: unknown; reason?: string }>
  }
  return { kind, organizer, applyMock, undoMock, records, setDecision: (value: ActionCardDecision | undefined) => { decision = value } }
}

describe('organizer action card', () => {
  it('applies the batch and records the outcome', async () => {
    const h = harness()
    expect(h.kind.details.parse(proposal.details)).toEqual(proposal.details)
    const agent = { session: {} }
    await expect(h.kind.act(agent, proposal, 'apply')).resolves.toMatchObject({
      status: 'settled', decision: { phase: 'applied', data: { done: 3, failed: 0 } },
    })
    expect(h.records).toHaveLength(1)
  })

  it('undoes an applied batch and refuses a second apply', async () => {
    const h = harness()
    const agent = { session: {} }
    await h.kind.act(agent, proposal, 'apply')
    h.setDecision({ cardId: proposal.cardId, action: 'organize_files', phase: 'applied' })
    await expect(h.kind.act(agent, proposal, 'apply')).resolves.toEqual({ status: 'refused', reason: 'already-applied' })
    await expect(h.kind.act(agent, proposal, 'undo')).resolves.toMatchObject({ status: 'settled', decision: { phase: 'undone' } })
    expect(h.organizer.undo).toHaveBeenCalledWith('batch-1')
  })

  it('refuses undo before apply and records a failure', async () => {
    const h = harness()
    const agent = { session: {} }
    await expect(h.kind.act(agent, proposal, 'undo')).resolves.toEqual({ status: 'refused', reason: 'not-applied' })
    const failing = harness()
    failing.applyMock.mockRejectedValueOnce(new Error('disk full'))
    await expect(failing.kind.act(agent, proposal, 'apply')).resolves.toMatchObject({
      status: 'settled', decision: { phase: 'failed', data: { error: 'disk full' } },
    })
  })
})
