// @vitest-environment jsdom
/** Task panel grouping and user actions. */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { TaskView } from '@deepseek-ai/dsh-tasks/types'
import type {} from '../src/client/mount.ts'
import type { TasksFace } from '../src/client/face.ts'
import { dictionaries, type TasksKey } from '../src/client/locales.ts'
import { TaskPanel, taskGroup } from '../src/client/TaskPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { tasks: TasksKey }
}

afterEach(cleanup)

const now = Date.now()
const t = ((key: string, params?: Record<string, string | number>) => {
  const text = dictionaries.en[key as TasksKey] ?? key
  return params === undefined ? text : text.replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params[name] ?? ''))
}) as TranslateNS<'tasks'>

function task(over: Partial<TaskView>): TaskView {
  return {
    id: 'task-1', title: 'Write report', status: 'open', priority: 'normal',
    filePaths: [], tags: [], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), ...over,
  }
}

function harness(tasks: readonly TaskView[]) {
  const face: TasksFace = {
    list: vi.fn(async () => tasks),
    add: vi.fn(async title => task({ id: 'new', title })),
    complete: vi.fn(async id => task({ id, status: 'done' })),
    remove: vi.fn(async () => undefined),
  }
  return { face, ...render(<TaskPanel face={face} lifetime={new AbortController().signal} t={t} />) }
}

describe('task panel', () => {
  it('groups by due date and status', () => {
    expect(taskGroup(task({ dueAt: new Date(now - 86_400_000).toISOString() }), now)).toBe('overdue')
    expect(taskGroup(task({ dueAt: new Date(now).toISOString() }), now)).toBe('today')
    expect(taskGroup(task({ dueAt: new Date(now + 3 * 86_400_000).toISOString() }), now)).toBe('week')
    expect(taskGroup(task({}), now)).toBe('later')
    expect(taskGroup(task({ status: 'done' }), now)).toBe('done')
  })

  it('renders groups, completes, removes, and adds a task', async () => {
    const view = harness([
      task({ id: 'a', title: 'Overdue item', dueAt: new Date(now - 86_400_000).toISOString(), tags: ['work'] }),
      task({ id: 'b', title: 'Later item' }),
      task({ id: 'c', title: 'Done item', status: 'done' }),
    ])
    await waitFor(() => { expect(view.getByText('Overdue item')).toBeTruthy() })
    expect(view.getByText('Overdue')).toBeTruthy()
    expect(view.getByText('Later')).toBeTruthy()
    expect(view.getByText('Done')).toBeTruthy()
    fireEvent.click(view.getAllByLabelText('Complete task')[0]!)
    expect(view.face.complete).toHaveBeenCalledWith('a', true)
    await waitFor(() => { expect(view.face.list).toHaveBeenCalledTimes(2) })
    fireEvent.click(view.getAllByLabelText('Remove task')[0]!)
    expect(view.face.remove).toHaveBeenCalledWith('a')

    const input = view.getByLabelText('Add a task…')
    fireEvent.change(input, { target: { value: 'New task' } })
    fireEvent.click(view.getByRole('button', { name: 'Add' }))
    expect(view.face.add).toHaveBeenCalledWith('New task')
  })
})
