/** In-place message retraction tombstone. */
import { memo } from 'react'
import type { ChatNodeViewProps } from '../contract/slots.ts'
import css from './RetractionNodeView.module.css'

/** Render one retracted range without exposing the hidden content. */
export const RetractionNodeView = memo(function RetractionNodeView({ node, t }: ChatNodeViewProps<'retraction'>) {
  return (
    <div className={css.root} role="status" data-chat-retraction={node.data.targetSeq}>
      <span className={css.label}>{t('message.retracted')}</span>
      <span className={css.count}>{t('message.retractedCount', { count: node.data.shadowedSeqs.length })}</span>
      <span className={css.hint}>{t('message.retractedHint')}</span>
    </div>
  )
})
