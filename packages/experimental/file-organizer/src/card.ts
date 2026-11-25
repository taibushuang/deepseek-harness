/** Action-card kind that lets a human apply or undo one previewed organization batch. */
import { z as zod } from 'zod'
import type { ActionCardDecision, ActionCardProposalOf, ActionCardResult, ActionCards } from '@deepseek-ai/dsh-action-cards'
import type { FileOrganizer } from './service.ts'

/** Card action registered by the organizer. */
export const ORGANIZE_CARD_ACTION = 'organize_files'

/** Fields the model copies from `organize_preview` into one action card. */
export const organizerCardDetails = zod.object({
  batchId: zod.string().min(1),
  directory: zod.string().min(1),
  totalMoves: zod.number().int().nonnegative(),
  totalSkipped: zod.number().int().nonnegative(),
})

type OrganizerCardDetails = zod.infer<typeof organizerCardDetails>

const statusGuidance = 'File organization cards: applied means the batch moved; partial means some destinations were skipped or failed; '
  + 'undone or undoPartial reports a reversal. Offer apply again only after a failed or undone batch.'

/**
 * Register the card kind beside an organizer.
 * @param cards - optional action-card service whose kind registry receives this kind.
 * @param organizer - durable organizer whose apply/undo the card calls.
 */
export function registerOrganizerCard(
  cards: Pick<ActionCards, 'register' | 'view' | 'record'>,
  organizer: Pick<FileOrganizer, 'apply' | 'undo'>,
): void {
  cards.register({
    action: ORGANIZE_CARD_ACTION,
    details: organizerCardDetails,
    verbs: { apply: { writes: true }, undo: { writes: true } },
    openPhases: ['applied', 'partial'],
    statusGuidance,
    async act(agent, proposal: ActionCardProposalOf<OrganizerCardDetails>, verb): Promise<ActionCardResult> {
      const previous = cards.view(agent.session).decisions[proposal.cardId]
      if (verb === 'apply' && previous !== undefined
        && (previous.phase === 'applied' || previous.phase === 'partial')) {
        return { status: 'refused', reason: 'already-applied' }
      }
      if (verb === 'undo' && previous === undefined) {
        return { status: 'refused', reason: 'not-applied' }
      }
      try {
        const result = verb === 'apply'
          ? await organizer.apply(proposal.details.batchId)
          : await organizer.undo(proposal.details.batchId)
        const decision: ActionCardDecision = {
          cardId: proposal.cardId,
          action: ORGANIZE_CARD_ACTION,
          phase: result.status,
          data: { done: result.done, failed: result.failed },
        }
        cards.record(agent, decision)
        return { status: 'settled', decision }
      } catch (error) {
        const decision: ActionCardDecision = {
          cardId: proposal.cardId,
          action: ORGANIZE_CARD_ACTION,
          phase: 'failed',
          data: { error: error instanceof Error ? error.message : String(error) },
        }
        cards.record(agent, decision)
        return { status: 'settled', decision }
      }
    },
  })
}
