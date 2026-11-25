/** The `tasks` page: due-date groups, quick add, complete/reopen, and remove. */
import { useEffect, useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TaskView } from '@deepseek-ai/dsh-tasks/types'
import type { TasksFace } from './face.ts'
import { NS, type TasksKey } from './locales.ts'
import css from './TaskPanel.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { tasks: TasksKey }
}

/** Panel props: copy from the locale seat and the operations bound to the Remote. */
export type TaskPanelProps = PropsLocale<typeof NS> & {
  /** Task operations bound to the Remote namespace. */
  readonly face: TasksFace
  /** Aborts reads when the plugin unloads. */
  readonly lifetime: AbortSignal
}

/** Visible groups, in display order. */
const GROUPS = ['overdue', 'today', 'week', 'later', 'done'] as const
type Group = typeof GROUPS[number]

/**
 * Place one task in its due-date group.
 * @param task - task to place.
 * @param now - current time.
 * @returns the group key.
 */
export function taskGroup(task: TaskView, now: number): Group {
  if (task.status === 'done') return 'done'
  if (task.dueAt === undefined) return 'later'
  const due = Date.parse(task.dueAt)
  const day = new Date(now)
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const tomorrow = start + 86_400_000
  if (due < start) return 'overdue'
  if (due < tomorrow) return 'today'
  if (due < start + 7 * 86_400_000) return 'week'
  return 'later'
}

/**
 * The task page body.
 * @param props - copy, Remote face, and unload signal.
 * @returns the panel.
 */
export function TaskPanel({ face, lifetime, t }: TaskPanelProps) {
  const [tasks, setTasks] = useState<readonly TaskView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string>()
  const [addError, setAddError] = useState<string>()

  const load = (signal: AbortSignal = lifetime): void => {
    setLoading(true)
    setError(undefined)
    face.list(signal).then(
      (value) => { if (!signal.aborted) { setTasks(value); setLoading(false) } },
      (reason: unknown) => {
        if (signal.aborted) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
      },
    )
  }
  useEffect(() => { load(); return () => { /* lifetime owns the abort */ } }, [face, lifetime])

  const grouped = useMemo(() => {
    const now = Date.now()
    const buckets = new Map<Group, TaskView[]>(GROUPS.map(group => [group, []]))
    for (const task of tasks) buckets.get(taskGroup(task, now))?.push(task)
    for (const list of buckets.values()) {
      list.sort((left, right) => (left.dueAt ?? '9999').localeCompare(right.dueAt ?? '9999'))
    }
    return buckets
  }, [tasks])

  const run = async (key: string, operation: () => Promise<unknown>, failKey: TasksKey): Promise<void> => {
    setBusy(key)
    try {
      await operation()
      load()
    } catch (reason) {
      setError(t(failKey, { message: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      setBusy(undefined)
    }
  }

  const add = (): void => {
    const title = draft.trim()
    if (title === '') return
    setBusy('add')
    setAddError(undefined)
    face.add(title).then(
      () => { setDraft(''); load() },
      (reason: unknown) => {
        setAddError(t('add.failed', { message: reason instanceof Error ? reason.message : String(reason) }))
      },
    ).finally(() => { setBusy(undefined) })
  }

  return (
    <div className={css.root}>
      <header className={css.header}>
        <h2 className={css.title}>{t('type.label')}</h2>
        <button type="button" className={css.refresh} disabled={loading} onClick={() => { load() }} aria-label={t('retry')}>
          ↻
        </button>
      </header>
      <form className={css.add} onSubmit={(event) => { event.preventDefault(); add() }}>
        <input
          className={css.input}
          value={draft}
          placeholder={t('add.placeholder')}
          aria-label={t('add.placeholder')}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <button type="submit" className={css.addButton} disabled={busy === 'add' || draft.trim() === ''}>{t('add.button')}</button>
      </form>
      {addError !== undefined && <p role="alert" className={css.error}>{addError}</p>}
      {error !== undefined && (
        <div role="alert" className={css.error}>
          {t('error', { message: error })}
          <button type="button" className={css.retry} onClick={() => { load() }}>{t('retry')}</button>
        </div>
      )}
      {loading && tasks.length === 0 ? <p className={css.empty}>{t('loading')}</p> : null}
      {!loading && tasks.length === 0 && error === undefined ? <p className={css.empty}>{t('empty')}</p> : null}
      {GROUPS.map((group) => {
        const items = grouped.get(group) ?? []
        if (items.length === 0) return null
        return (
          <section key={group} className={css.group} aria-label={t(`group.${group}`)}>
            <h3 className={css.groupTitle}>
              {t(`group.${group}`)}
              <span className={css.count}>{t('count', { count: items.length })}</span>
            </h3>
            <ul className={css.list}>
              {items.map(task => (
                <li key={task.id} className={css.row} data-task-status={task.status}>
                  <button
                    type="button"
                    className={css.check}
                    aria-label={t(task.status === 'done' ? 'row.reopen' : 'row.complete')}
                    aria-pressed={task.status === 'done'}
                    disabled={busy === task.id}
                    onClick={() => { void run(task.id, () => face.complete(task.id, task.status !== 'done'), 'update.failed') }}
                  >
                    {task.status === 'done' ? '✓' : ''}
                  </button>
                  <div className={css.body}>
                    <span className={css.taskTitle}>{task.title}</span>
                    <span className={css.meta}>
                      {task.dueAt === undefined ? null : <span>{t('row.due', { date: task.dueAt.slice(0, 10) })}</span>}
                      {task.tags.length === 0 ? null : <span>{t('row.tags', { tags: task.tags.join(', ') })}</span>}
                      {task.filePaths.length === 0 ? null : <span title={task.filePaths.join('\n')}>{t('row.files', { count: task.filePaths.length })}</span>}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={css.remove}
                    aria-label={t('row.remove')}
                    disabled={busy === task.id}
                    onClick={() => { void run(task.id, () => face.remove(task.id), 'remove.failed') }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
