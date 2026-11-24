import type { Context } from '@deepseek-ai/cordis'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import type { RetractionChatData } from '../contract/chat-nodes.ts'
import { chatNode } from './common.ts'

/** In-place retraction tombstone Definition. */
export const retractionDefinition: ConversationNodeDefinition<RetractionChatData> = {
  kind: 'retraction',
  target: 'chat',
  match: event => event.type === 'session/retract'
    ? { id: String(event.data.targetSeq), role: 'start' }
    : null,
  start: (_context, match) => {
    if (match.event.type !== 'session/retract') throw new Error('retraction start requires session/retract')
    return {
      targetSeq: match.event.data.targetSeq,
      fromTurn: match.event.data.fromTurn,
      toTurn: match.event.data.toTurn,
      shadowedSeqs: [...match.event.data.shadowedSeqs],
      reason: match.event.data.reason,
      time: match.event.time,
    }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    const seq = context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0
    return chatNode(context, 'retraction', seq, context.state, { location: { kind: 'session' } })
  },
}

/**
 * Register the retraction tombstone contribution.
 * @param ctx - owning UI Conversation context.
 */
export function registerRetractionConversationNode(ctx: Context): void {
  ctx.uiConversation.events.register(retractionDefinition)
}
