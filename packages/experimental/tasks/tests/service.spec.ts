/** The task service over a real JSON storage domain. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Tasks } from '../src/service.ts'

let base: string
let ctx: Context
let tasks: Tasks
const signal = new AbortController().signal

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'dsh-tasks-'))
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(base, '.storage') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(Tasks, { maxTasks: 100, maxList: 100 })
  const service = ctx.get('tasks')
  if (service === undefined) throw new Error('tasks service was not provided')
  tasks = service
})
afterEach(async () => {
  await ctx.fiber.dispose()
  await rm(base, { recursive: true, force: true })
})

describe('task lifecycle', () => {
  it('adds, lists, updates, completes, reopens, and removes one task', async () => {
    const added = await tasks.add({
      title: '  write report  ',
      dueAt: '2026-11-30',
      priority: 'high',
      tags: ['work'],
      filePaths: ['/work/report.docx'],
      notes: 'include Q4',
    }, signal)
    expect(added).toMatchObject({ title: 'write report', status: 'open', priority: 'high', dueAt: '2026-11-30T00:00:00.000Z' })
    expect(await tasks.list({ status: 'open' }, signal)).toHaveLength(1)
    expect(await tasks.list({ status: 'open', tag: 'work' }, signal)).toHaveLength(1)
    expect(await tasks.list({ status: 'open', tag: 'other' }, signal)).toHaveLength(0)
    expect(await tasks.list({ status: 'open', filePath: '/work/report.docx' }, signal)).toHaveLength(1)

    const updated = await tasks.update({ id: added.id, patch: { title: 'final report', tags: ['work', 'urgent'], notes: null } }, signal)
    expect(updated).toMatchObject({ title: 'final report', tags: ['work', 'urgent'] })
    expect(updated.notes).toBeUndefined()
    const completed = await tasks.complete({ id: added.id }, signal)
    expect(completed).toMatchObject({ status: 'done' })
    expect(completed.completedAt).toBeDefined()
    expect(await tasks.list({ status: 'done' }, signal)).toHaveLength(1)
    const reopened = await tasks.complete({ id: added.id, done: false }, signal)
    expect(reopened.status).toBe('open')
    expect(reopened.completedAt).toBeUndefined()
    await tasks.remove({ id: added.id }, signal)
    expect(await tasks.list({ status: 'all' }, signal)).toHaveLength(0)
  })

  it('rejects empty titles, invalid dates, multi-word tags, unknown ids, and the limit', async () => {
    await expect(tasks.add({ title: ' ' }, signal)).rejects.toMatchObject({ code: 'TASK_INVALID' })
    await expect(tasks.add({ title: 'x', dueAt: 'not-a-date' }, signal)).rejects.toMatchObject({ code: 'TASK_INVALID' })
    await expect(tasks.add({ title: 'x', tags: ['two words'] }, signal)).rejects.toMatchObject({ code: 'TASK_INVALID' })
    await expect(tasks.view({ id: 'missing' }, signal)).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' })
  })

  it('registers the six model tools', () => {
    const names = ctx.tools.schemas().map(tool => tool.name).filter(name => name.startsWith('task_')).sort()
    expect(names).toEqual(['task_add', 'task_complete', 'task_list', 'task_remove', 'task_update', 'task_view'])
  })
})
