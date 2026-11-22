// @vitest-environment jsdom
/**
 * Tag panel behavior: the tag list and its filter, chip selection driving the
 * expression, debounced expression search, per-row add and remove, and the
 * empty and failure states.
 */
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TaggedEntry, TagSummary } from '@deepseek-ai/dsh-filetags/types'
import { TagPanel } from '../src/client/FiletagsBody.tsx'
import type { FiletagsFace } from '../src/client/face.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh)

const TAGS: readonly TagSummary[] = [
  { name: 'archive', count: 1 },
  { name: 'project', count: 2 },
]
const ENTRIES: readonly TaggedEntry[] = [
  { path: '/tmp/work', isDir: true, tags: ['project'] },
  { path: '/tmp/note.md', isDir: false, tags: ['project', 'archive'] },
]

/** A face whose reads answer the fixtures and whose writes succeed. */
function face(overrides: Partial<FiletagsFace> = {}): FiletagsFace {
  const invalid = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'filetags/invalid-argument'
  return {
    listTags: vi.fn(async () => TAGS),
    search: vi.fn(async () => ENTRIES),
    tag: vi.fn(async () => undefined),
    untag: vi.fn(async () => undefined),
    invalidArgument: invalid,
    ...overrides,
  }
}

/**
 * Render the panel with one face.
 * @param value - tag operations.
 * @returns the rendered container and the face.
 */
function panel(value: FiletagsFace) {
  render(createElement(TagPanel, { t, face: value }))
  return value
}

afterEach(() => { cleanup() })

describe('TagPanel', () => {
  it('lists tags with their counts and filters them by name', async () => {
    panel(face())
    expect(await screen.findByText('project')).toBeDefined()
    expect(screen.getByText('archive')).toBeDefined()
    fireEvent.change(screen.getByLabelText(t('tags.filterPlaceholder')), { target: { value: 'pro' } })
    await waitFor(() => { expect(screen.queryByText('archive')).toBeNull() })
    expect(screen.getByText('project')).toBeDefined()
  })

  it('turns a chip selection into an expression and searches for it', async () => {
    const value = panel(face())
    fireEvent.click(await screen.findByRole('button', { name: /^project/ }))
    expect((screen.getByLabelText(t('expression.label')) as HTMLInputElement).value).toBe('project')
    await waitFor(() => { expect(value.search).toHaveBeenCalledWith('project', expect.any(AbortSignal)) })
    expect(await screen.findByText('/tmp/work')).toBeDefined()
    expect(screen.getByText(t('results.count', { count: '2' }))).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^archive/ }))
    expect((screen.getByLabelText(t('expression.label')) as HTMLInputElement).value).toBe('project and archive')
    await waitFor(() => { expect(value.search).toHaveBeenLastCalledWith('project and archive', expect.any(AbortSignal)) })
  })

  it('drops the chip selection when the expression is typed by hand', async () => {
    panel(face())
    fireEvent.click(await screen.findByRole('button', { name: /^project/ }))
    fireEvent.change(screen.getByLabelText(t('expression.label')), { target: { value: 'archive' } })
    await waitFor(() => { expect(screen.getByText('archive').closest('button')?.getAttribute('aria-pressed')).toBe('false') })
  })

  it('filters the result paths without another Host search', async () => {
    const value = panel(face())
    fireEvent.click(await screen.findByRole('button', { name: /^project/ }))
    expect(await screen.findByText('/tmp/note.md')).toBeDefined()
    const calls = (value.search as ReturnType<typeof vi.fn>).mock.calls.length
    fireEvent.change(screen.getByLabelText(t('results.filterPlaceholder')), { target: { value: 'note' } })
    await waitFor(() => { expect(screen.queryByText('/tmp/work')).toBeNull() })
    expect(screen.getByText('/tmp/note.md')).toBeDefined()
    expect((value.search as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })

  it('adds and removes a tag on one row and refreshes both reads', async () => {
    const value = panel(face())
    fireEvent.click(await screen.findByRole('button', { name: /^project/ }))
    const row = (await screen.findByText('/tmp/note.md')).closest('li')!
    const input = within(row).getByLabelText(t('row.addPlaceholder'))
    fireEvent.change(input, { target: { value: 'draft' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => { expect(value.tag).toHaveBeenCalledWith('/tmp/note.md', ['draft'], expect.any(AbortSignal)) })
    await waitFor(() => { expect((value.listTags as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1) })

    fireEvent.click(within(row).getByLabelText(t('row.remove', { tag: 'archive' })))
    await waitFor(() => { expect(value.untag).toHaveBeenCalledWith('/tmp/note.md', 'archive', expect.any(AbortSignal)) })
  })

  it('clears the add field only after a successful write', async () => {
    const failing = face({
      tag: vi.fn(async () => { throw Object.assign(new Error('no'), { code: 'filetags/failed' }) }),
    })
    panel(failing)
    fireEvent.click(await screen.findByRole('button', { name: /^project/ }))
    const row = (await screen.findByText('/tmp/note.md')).closest('li')!
    const input = within(row).getByLabelText(t('row.addPlaceholder')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'draft' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(t('error.write')) })
    expect(input.value).toBe('draft')
  })

  it('reports a malformed expression and an unreadable tag list separately', async () => {
    const invalid = face({
      search: vi.fn(async () => { throw Object.assign(new Error('bad'), { code: 'filetags/invalid-argument' }) }),
    })
    panel(invalid)
    fireEvent.change(await screen.findByLabelText(t('expression.label')), { target: { value: 'a and' } })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(t('expression.invalid')) })

    cleanup()
    panel(face({ listTags: vi.fn(async () => { throw new Error('offline') }) }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(t('error.load')) })
  })

  it('shows the empty states for no tags, no selection, and no match', async () => {
    panel(face({ listTags: vi.fn(async () => []) }))
    expect(await screen.findByText(t('empty.noTags'))).toBeDefined()

    cleanup()
    const value = panel(face({ search: vi.fn(async () => []) }))
    expect(await screen.findByText(t('empty.noSelection'))).toBeDefined()
    fireEvent.change(screen.getByLabelText(t('expression.label')), { target: { value: 'project' } })
    await waitFor(() => { expect(screen.getByText(t('empty.noResults'))).toBeDefined() })
    expect(value.search).toHaveBeenCalled()
  })
})

/**
 * One promise whose settlement the test controls.
 * @returns the promise and its settle functions.
 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((settle, fail) => { resolve = settle; reject = fail })
  return { promise, resolve, reject }
}

/** Wait past the panel's debounce before the next interaction. */
async function pastDebounce(): Promise<void> {
  await new Promise(done => setTimeout(done, 320))
}

describe('TagPanel cancellation and write failures', () => {
  it('ignores a tag list that arrives after the panel unloads', async () => {
    const pending = deferred<readonly TagSummary[]>()
    panel(face({ listTags: vi.fn(() => pending.promise) }))
    cleanup()
    pending.resolve(TAGS)
    await Promise.resolve()
    await Promise.resolve()
  })

  it('ignores a tag list failure that arrives after the panel unloads', async () => {
    const pending = deferred<readonly TagSummary[]>()
    panel(face({ listTags: vi.fn(() => pending.promise) }))
    cleanup()
    pending.reject(new Error('offline'))
    await Promise.resolve()
    await Promise.resolve()
  })

  it('ignores a search result that arrives after the panel unloads', async () => {
    const pending = deferred<readonly TaggedEntry[]>()
    panel(face({ search: vi.fn(() => pending.promise) }))
    fireEvent.change(await screen.findByLabelText(t('expression.label')), { target: { value: 'project' } })
    await pastDebounce()
    cleanup()
    pending.resolve(ENTRIES)
    await Promise.resolve()
    await Promise.resolve()
  })

  it('ignores a search failure that arrives after the panel unloads', async () => {
    const pending = deferred<readonly TaggedEntry[]>()
    panel(face({ search: vi.fn(() => pending.promise) }))
    fireEvent.change(await screen.findByLabelText(t('expression.label')), { target: { value: 'project' } })
    await pastDebounce()
    cleanup()
    pending.reject(Object.assign(new Error('bad'), { code: 'filetags/invalid-argument' }))
    await Promise.resolve()
    await Promise.resolve()
  })

  it('reports an unreadable search and an invalid tag name with their own copy', async () => {
    panel(face({ search: vi.fn(async () => { throw new Error('offline') }) }))
    fireEvent.change(await screen.findByLabelText(t('expression.label')), { target: { value: 'project' } })
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(t('error.load')) })

    cleanup()
    panel(face({ tag: vi.fn(async () => { throw Object.assign(new Error('bad'), { code: 'filetags/invalid-argument' }) }) }))
    fireEvent.click(await screen.findByRole('button', { name: /^project/ }))
    const row = (await screen.findByText('/tmp/note.md')).closest('li')!
    const input = within(row).getByLabelText(t('row.addPlaceholder'))
    fireEvent.change(input, { target: { value: 'two words' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toBe(t('error.tagName')) })
  })

  it('does not call the Host when the add field holds no tag name', async () => {
    const value = panel(face())
    fireEvent.click(await screen.findByRole('button', { name: /^project/ }))
    const row = (await screen.findByText('/tmp/note.md')).closest('li')!
    fireEvent.submit(within(row).getByLabelText(t('row.addPlaceholder')).closest('form')!)
    expect(value.tag).not.toHaveBeenCalled()
  })
})
