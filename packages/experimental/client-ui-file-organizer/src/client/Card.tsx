/** Body of an `organize_files` card: apply, undo, and report one organization batch. */
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ActionCardBodyProps } from '@deepseek-ai/dsh-client-ui-action-cards/client'
import type { FileOrganizerKey } from './locales.ts'
import css from './Card.module.css'

const detailsSchema = z.object({
  batchId: z.string().min(1),
  directory: z.string().min(1),
  totalMoves: z.number().int().nonnegative(),
  totalSkipped: z.number().int().nonnegative(),
})

const dataSchema = z.object({
  done: z.number().int().nonnegative().optional(),
  failed: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
})

type CardVerb = 'apply' | 'undo' | 'dismiss'

const REASON_KEYS: readonly FileOrganizerKey[] = [
  'unknown', 'notLiveRoot', 'accessDenied', 'readOnly', 'closing', 'unavailable',
  'alreadyApplied', 'notApplied',
]

function reasonKey(reason: string): FileOrganizerKey {
  return REASON_KEYS.find(key => key === reason) ?? 'unavailable'
}

function statusKey(phase: string): FileOrganizerKey | undefined {
  switch (phase) {
    case 'applied': return 'applied'
    case 'partial': return 'partial'
    case 'undone': return 'undone'
    case 'undoPartial': return 'undoPartial'
    case 'failed': return 'failed'
    default: return undefined
  }
}

/**
 * Display one file-organization card.
 * @param props - card, state, Host action and locale copy.
 * @returns the card body.
 */
export function OrganizerCardBody({
  proposal, decision, summary, fallback, act, t,
}: ActionCardBodyProps<'fileOrganizer'>) {
  const details = detailsSchema.safeParse(proposal.details)
  const [pending, setPending] = useState<CardVerb>()
  const [error, setError] = useState<FileOrganizerKey>()
  if (!details.success) return fallback
  const parsed = dataSchema.safeParse(decision?.data ?? {})
  const data = parsed.success ? parsed.data : {}
  const phase = decision?.phase
  const status = phase === undefined ? undefined : statusKey(phase)
  const canApply = phase === undefined || phase === 'failed' || phase === 'undone' || phase === 'undoPartial'
  const canUndo = phase === 'applied' || phase === 'partial'
  const busy = pending !== undefined
  const run = async (verb: CardVerb): Promise<void> => {
    setPending(verb)
    setError(undefined)
    try {
      const result = await act(verb)
      if (result === undefined) setError('transport')
      else if (result.status === 'refused' || result.status === 'unconfirmed') setError(reasonKey(result.reason))
    } catch {
      setError('transport')
    } finally {
      setPending(undefined)
    }
  }
  return (
    <div className={css.body} aria-busy={busy || undefined}>
      <div className={css.heading}>
        <span className={css.label}>{t('heading')}</span>
        <span className={css.count}>{t('summary', { moves: details.data.totalMoves, directory: details.data.directory })}</span>
        {details.data.totalSkipped > 0 && (
          <span className={css.skipped}>{t('skipped', { count: details.data.totalSkipped })}</span>
        )}
      </div>
      {summary}
      {status !== undefined && (
        <p role="status" className={css.status}>
          {t(status)}
          {data.done !== undefined && ` · ${String(data.done)}`}
          {data.failed !== undefined && data.failed > 0 && ` / ${String(data.failed)}`}
        </p>
      )}
      {phase === 'failed' && data.error !== undefined && <p role="alert" className={css.status}>{data.error}</p>}
      {error !== undefined && <p role="alert" className={css.status}>{t(error)}</p>}
      <footer className={css.footer}>
        <span className={css.scope}>{t('scope')}</span>
        <div className={css.actions}>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void run('dismiss') }}>
            {t(pending === 'dismiss' ? 'working' : 'dismiss')}
          </Button>
          {canUndo && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { void run('undo') }}>
              {t(pending === 'undo' ? 'working' : 'undo')}
            </Button>
          )}
          {canApply && (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => { void run('apply') }}>
              {t(pending === 'apply' ? 'working' : 'apply')}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
