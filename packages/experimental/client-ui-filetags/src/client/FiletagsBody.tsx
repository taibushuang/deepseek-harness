/**
 * The `tags` page: every tag with its path count, a tag-expression search, and
 * each result's tags with per-row add and remove actions.
 * @module @deepseek-ai/dsh-client-ui-filetags/FiletagsBody
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TaggedEntry, TagSummary } from '@deepseek-ai/dsh-filetags/types'
import type { FiletagsFace } from './face.ts'
import { NS } from './locales.ts'
import { expressionOf, filterEntries, filterTags, tagNamesOf, toggleTag } from './presentation.ts'
import css from './FiletagsBody.module.css'

/** Delay before a typed expression reaches the Host. */
const SEARCH_DELAY_MS = 300

/**
 * The panel's props: copy from the slot's locale seat, and the tag operations
 * bound to the Remote namespace.
 */
export type TagPanelProps = PropsLocale<typeof NS> & {
  /** Tag operations bound to the Remote namespace. */
  readonly face: FiletagsFace
}

/** Copy read by one result row. */
type RowProps = {
  readonly entry: TaggedEntry
  readonly t: TranslateNS<typeof NS>
  readonly onAdd: (names: readonly string[]) => Promise<boolean>
  readonly onRemove: (name: string) => Promise<boolean>
  /** Native open, present only while the Host desktop answers. */
  readonly onOpen?: (() => Promise<boolean>) | undefined
}

/**
 * One tagged path with its tag chips and its add-tag editor.
 * @param props - the entry, copy, and write callbacks.
 * @returns the row.
 */
function ResultRow({ entry, t, onAdd, onRemove, onOpen }: RowProps): ReactNode {
  const [draft, setDraft] = useState('')
  const submit = (): void => {
    const names = tagNamesOf(draft)
    if (names.length === 0) return
    void onAdd(names).then((added) => { if (added) setDraft('') })
  }
  return (
    <li className={css.row}>
      <div className={css.rowHead}>
        <span className={css.kind}>{entry.isDir ? t('row.dir') : t('row.file')}</span>
        <code className={css.path} title={entry.path}>{entry.path}</code>
        {onOpen === undefined ? null : (
          <button type="button" className={css.openButton} onClick={() => { void onOpen() }}>{t('row.open')}</button>
        )}
      </div>
      <ul className={css.chips}>
        {entry.tags.map(name => (
          <li key={name} className={css.chip}>
            <span>{name}</span>
            <button
              type="button" className={css.remove} aria-label={t('row.remove', { tag: name })}
              onClick={() => { void onRemove(name) }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className={css.addRow}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          className={css.input} value={draft} aria-label={t('row.addPlaceholder')} placeholder={t('row.addPlaceholder')}
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <button type="submit" className={css.addButton}>{t('row.add')}</button>
      </form>
    </li>
  )
}

/**
 * The tag panel body.
 * @param props - composed slot props carrying the Remote-backed face and copy.
 * @returns the tag filter, expression search, and results.
 */
export function TagPanel({ t, face }: TagPanelProps): ReactNode {
  const { listTags, search, tag, untag, invalidArgument } = face
  const [tags, setTags] = useState<readonly TagSummary[]>([])
  const [selected, setSelected] = useState<readonly string[]>([])
  const [expression, setExpression] = useState('')
  const [entries, setEntries] = useState<readonly TaggedEntry[]>([])
  const [tagQuery, setTagQuery] = useState('')
  const [pathQuery, setPathQuery] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  // The slot synthesizes `t` per render; effects read the current copy so a new
  // function identity cannot abort their in-flight request and strand the panel.
  const tRef = useRef(t)
  tRef.current = t
  const [canOpen, setCanOpen] = useState(false)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const found = await listTags(controller.signal)
        if (!controller.signal.aborted) setTags(found)
      } catch {
        if (!controller.signal.aborted) setError(tRef.current('error.load'))
      }
    })()
    return () => { controller.abort() }
  }, [listTags, generation])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const answer = await face.canOpen(controller.signal)
        if (!controller.signal.aborted) setCanOpen(answer)
      } catch {
        if (!controller.signal.aborted) setCanOpen(false)
      }
    })()
    return () => { controller.abort() }
  }, [face])

  useEffect(() => {
    const text = expression.trim()
    if (text === '') {
      setEntries([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await search(text, controller.signal)
          if (controller.signal.aborted) return
          setEntries(found)
          setError(undefined)
        } catch (cause) {
          if (controller.signal.aborted) return
          setError(invalidArgument(cause) ? tRef.current('expression.invalid') : tRef.current('error.load'))
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      })()
    }, SEARCH_DELAY_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [expression, search, invalidArgument, generation])

  const visibleTags = useMemo(() => filterTags(tags, tagQuery), [tags, tagQuery])
  const visibleEntries = useMemo(() => filterEntries(entries, pathQuery), [entries, pathQuery])

  const toggle = (name: string): void => {
    const next = toggleTag(selected, name)
    setSelected(next)
    setExpression(expressionOf(next))
  }
  const write = async (work: () => Promise<void>): Promise<boolean> => {
    try {
      await work()
      setError(undefined)
      setGeneration(value => value + 1)
      return true
    } catch (cause) {
      setError(invalidArgument(cause) ? t('error.tagName') : t('error.write'))
      return false
    }
  }

  const openPath = async (path: string): Promise<boolean> => {
    try {
      await face.open(path, new AbortController().signal)
      setError(undefined)
      return true
    } catch {
      setError(t('error.open'))
      return false
    }
  }

  const showEmptyTags = !loading && tags.length === 0
  const showNoSelection = !loading && tags.length > 0 && expression.trim() === ''
  const showNoResults = !loading && expression.trim() !== '' && visibleEntries.length === 0 && error === undefined

  return (
    <div className={css.root}>
      <input
        type="search" className={css.input} value={tagQuery} aria-label={t('tags.filterPlaceholder')}
        placeholder={t('tags.filterPlaceholder')} onChange={(event) => { setTagQuery(event.target.value) }}
      />
      {showEmptyTags ? <p className={css.empty}>{t('empty.noTags')}</p> : null}
      <ul className={css.tagList}>
        {visibleTags.map(tagSummary => (
          <li key={tagSummary.name}>
            <button
              type="button" className={selected.includes(tagSummary.name) ? `${css.tagButton} ${css.tagActive}` : css.tagButton}
              aria-pressed={selected.includes(tagSummary.name)} onClick={() => { toggle(tagSummary.name) }}
            >
              <span>{tagSummary.name}</span>
              <span className={css.count}>{tagSummary.count}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className={css.expression}>
        <label className={css.expressionLabel}>
          {t('expression.label')}
          <input
            className={css.input} value={expression} aria-label={t('expression.label')} placeholder={t('expression.placeholder')}
            onChange={(event) => {
              setExpression(event.target.value)
              setSelected([])
            }}
          />
        </label>
        <p className={css.hint}>{t('expression.hint')}</p>
      </div>

      {error === undefined ? null : <p className={css.error} role="alert">{error}</p>}
      {showNoSelection ? <p className={css.empty}>{t('empty.noSelection')}</p> : null}
      {loading ? <p className={css.hint}>{t('loading')}</p> : null}

      {expression.trim() === '' ? null : (
        <div className={css.results}>
          <div className={css.resultsHead}>
            <input
              type="search" className={css.input} value={pathQuery} aria-label={t('results.filterPlaceholder')}
              placeholder={t('results.filterPlaceholder')} onChange={(event) => { setPathQuery(event.target.value) }}
            />
            <span className={css.count}>{t('results.count', { count: String(visibleEntries.length) })}</span>
          </div>
          {showNoResults ? <p className={css.empty}>{t('empty.noResults')}</p> : null}
          <ul className={css.resultList}>
            {visibleEntries.map(entry => (
              <ResultRow
                key={entry.path} entry={entry} t={t}
                onAdd={names => write(() => tag(entry.path, names, new AbortController().signal))}
                onRemove={name => write(() => untag(entry.path, name, new AbortController().signal))}
                onOpen={canOpen ? () => openPath(entry.path) : undefined}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
