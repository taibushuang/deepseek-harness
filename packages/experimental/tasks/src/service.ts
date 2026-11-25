/** Durable personal tasks over one storage domain, exposed as tools and Remote operations. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { TaskError } from './error.ts'
import { tasksDomain } from './spec.ts'
import type {
  TaskAddRequest, TaskCompleteRequest, TaskListRequest, TaskRecord, TaskRemoveRequest,
  TaskUpdatePatch, TaskUpdateRequest, TaskView, TaskViewRequest,
} from './types.ts'

/** Deployment limits. */
export interface TasksConfig {
  /** Maximum stored tasks. */
  readonly maxTasks: number
  /** Maximum entries echoed by one list result. */
  readonly maxList: number
}

/** Schemastery validator for {@link TasksConfig}. */
export const tasksConfig: z<TasksConfig> = z.object({
  maxTasks: z.number().step(1).min(1).default(5000),
  maxList: z.number().step(1).min(1).default(500),
})

const DEFAULT_LIMIT = 500

/** Normalize and validate one due date. */
function dueDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TaskError(`due date ${JSON.stringify(value)} is not a valid ISO date`, 'TASK_INVALID')
  return new Date(parsed).toISOString()
}

/** Validate a one-word task tag. */
function tagsOf(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => {
    const tag = value.trim()
    if (tag === '' || /\s/u.test(tag)) throw new TaskError(`task tag ${JSON.stringify(value)} must be one word`, 'TASK_INVALID')
    return tag
  })
}

/** Sort tasks by open first, due date, priority, then creation. */
function compareTasks(left: TaskRecord, right: TaskRecord): number {
  if (left.status !== right.status) return left.status === 'open' ? -1 : 1
  const leftDue = left.dueAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(left.dueAt)
  const rightDue = right.dueAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(right.dueAt)
  if (leftDue !== rightDue) return leftDue - rightDue
  const rank = { high: 0, normal: 1, low: 2 } as const
  if (left.priority !== right.priority) return rank[left.priority] - rank[right.priority]
  return left.createdAt.localeCompare(right.createdAt)
}

/** Copy one record into the mutable JSON shape a tool output declares. */
function taskJson(task: TaskRecord): Record<string, JsonValue> {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    filePaths: [...task.filePaths],
    tags: [...task.tags],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    ...task.dueAt === undefined ? {} : { dueAt: task.dueAt },
    ...task.notes === undefined ? {} : { notes: task.notes },
    ...task.sourceSessionId === undefined ? {} : { sourceSessionId: task.sourceSessionId },
    ...task.sourceEventId === undefined ? {} : { sourceEventId: task.sourceEventId },
    ...task.completedAt === undefined ? {} : { completedAt: task.completedAt },
  }
}

/** Personal task service and its six model tools. */
export class Tasks extends TypertRemoteService {
  static inject = ['tools', 'typert', 'storageDomain']
  static Config = tasksConfig
  private opened: Promise<KvTable<string, TaskRecord>> | undefined

  /**
   * @param ctx - Host context carrying tools, Typert, and storage.
   * @param config - deployment limits.
   */
  constructor(ctx: Context, private readonly config: TasksConfig) {
    super(ctx, 'tasks', { namespace: 'tasks' })
    this.registerTools(ctx)
  }

  /**
   * Add one task.
   * @param request - title and optional fields.
   * @param signal - caller cancellation.
   * @returns the stored task.
   */
  @Remote
  async add(request: TaskAddRequest, signal: AbortSignal): Promise<TaskView> {
    signal.throwIfAborted()
    return await this.addTask(request)
  }

  /**
   * List tasks, newest open first.
   * @param request - optional filters.
   * @param signal - caller cancellation.
   * @returns matching tasks.
   */
  @Remote
  async list(request: TaskListRequest, signal: AbortSignal): Promise<readonly TaskView[]> {
    signal.throwIfAborted()
    return await this.listTasks(request)
  }

  /**
   * Read one task.
   * @param request - task id.
   * @param signal - caller cancellation.
   * @returns the stored task.
   */
  @Remote
  async view(request: TaskViewRequest, signal: AbortSignal): Promise<TaskView> {
    signal.throwIfAborted()
    return await this.viewTask(request.id)
  }

  /**
   * Replace the mutable fields of one task.
   * @param request - task id and patch.
   * @param signal - caller cancellation.
   * @returns the updated task.
   */
  @Remote
  async update(request: TaskUpdateRequest, signal: AbortSignal): Promise<TaskView> {
    signal.throwIfAborted()
    return await this.updateTask(request.id, request.patch)
  }

  /**
   * Complete or reopen one task.
   * @param request - task id and target state; defaults to done.
   * @param signal - caller cancellation.
   * @returns the updated task.
   */
  @Remote
  async complete(request: TaskCompleteRequest, signal: AbortSignal): Promise<TaskView> {
    signal.throwIfAborted()
    return await this.updateTask(request.id, { status: request.done === false ? 'open' : 'done' })
  }

  /**
   * Remove one task record. Files are never touched.
   * @param request - task id.
   * @param signal - caller cancellation.
   */
  @Remote
  async remove(request: TaskRemoveRequest, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    await this.removeTask(request.id)
  }

  private registerTools(ctx: Context): void {
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'task_add',
      description: 'Create one durable personal task. Due dates are ISO strings; tags are single words; file paths are stored for later opening.',
      parameters: {
        title: { type: 'string', required: true, description: 'Short actionable task title.' },
        due_at: { type: 'string', description: 'Optional ISO due date, for example 2026-11-30 or 2026-11-30T18:00:00+08:00.' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Priority; defaults to normal.' },
        file_paths: { type: 'array', items: { type: 'string' }, description: 'Optional absolute files or directories related to the task.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional single-word labels.' },
        notes: { type: 'string', description: 'Optional details.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { task: { type: 'object', required: true, additionalProperties: true, properties: {} } } },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args, exec) => {
        const task = await this.addTask({
          title: args.title,
          ...args.due_at === undefined || args.due_at === '' ? {} : { dueAt: args.due_at },
          ...args.priority === undefined ? {} : { priority: args.priority as TaskRecord['priority'] },
          ...args.file_paths === undefined ? {} : { filePaths: args.file_paths },
          ...args.tags === undefined ? {} : { tags: args.tags },
          ...args.notes === undefined || args.notes === '' ? {} : { notes: args.notes },
          ...exec.agent === undefined ? {} : { sourceSessionId: String(exec.agent.session.id) },
        })
        return { task: taskJson(task) }
      },
    })), 'tasks: add tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'task_list',
      description: 'List durable personal tasks. Use status open/done/all and optional tag or file path filters. Results are sorted open first, then due date.',
      parameters: {
        status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Lifecycle filter; defaults to open.' },
        tag: { type: 'string', description: 'Optional tag filter.' },
        file_path: { type: 'string', description: 'Optional related file path filter.' },
        limit: { type: 'integer', description: 'Maximum tasks to return.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { tasks: { type: 'array', required: true, items: { type: 'object', additionalProperties: true, properties: {} } } } },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args) => {
        return { tasks: (await this.listTasks({
          ...args.status === undefined ? {} : { status: args.status },
          ...args.tag === undefined ? {} : { tag: args.tag },
          ...args.file_path === undefined ? {} : { filePath: args.file_path },
          ...args.limit === undefined ? {} : { limit: args.limit },
        })).map(taskJson) }
      },
    })), 'tasks: list tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'task_view',
      description: 'Read one durable personal task by id.',
      parameters: { id: { type: 'string', required: true, description: 'Task id.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { task: { type: 'object', required: true, additionalProperties: true, properties: {} } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args) => { return { task: taskJson(await this.viewTask(args.id)) } },
    })), 'tasks: view tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'task_update',
      description: 'Update one durable personal task. Omit fields to keep them; pass null for due_at or notes to clear them.',
      parameters: {
        id: { type: 'string', required: true, description: 'Task id.' },
        title: { type: 'string', description: 'New title.' },
        due_at: { type: 'string', description: 'New ISO due date; an empty string clears it.' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'New priority.' },
        file_paths: { type: 'array', items: { type: 'string' }, description: 'Replacement related paths.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Replacement tags.' },
        notes: { type: 'string', description: 'New notes; an empty string clears them.' },
        status: { type: 'string', enum: ['open', 'done'], description: 'New lifecycle state.' },
      },
      output: { schema: { type: 'object', additionalProperties: false, properties: { task: { type: 'object', required: true, additionalProperties: true, properties: {} } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args) => {
        return { task: taskJson(await this.updateTask(args.id, {
          ...args.title === undefined ? {} : { title: args.title },
          ...args.due_at === undefined || args.due_at === '' ? {} : { dueAt: args.due_at },
          ...args.priority === undefined ? {} : { priority: args.priority as TaskRecord['priority'] },
          ...args.file_paths === undefined ? {} : { filePaths: args.file_paths },
          ...args.tags === undefined ? {} : { tags: args.tags },
          ...args.notes === undefined || args.notes === '' ? {} : { notes: args.notes },
          ...args.status === undefined ? {} : { status: args.status as TaskRecord['status'] },
        })) }
      },
    })), 'tasks: update tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'task_complete',
      description: 'Complete one durable personal task, or reopen it with done=false.',
      parameters: {
        id: { type: 'string', required: true, description: 'Task id.' },
        done: { type: 'boolean', description: 'Defaults to true; false reopens the task.' },
      },
      output: { schema: { type: 'object', additionalProperties: false, properties: { task: { type: 'object', required: true, additionalProperties: true, properties: {} } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args) => { return { task: taskJson(await this.updateTask(args.id, { status: args.done === false ? 'open' : 'done' })) } },
    })), 'tasks: complete tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'task_remove',
      description: 'Remove one durable personal task record. This never deletes files.',
      parameters: { id: { type: 'string', required: true, description: 'Task id.' } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { removed: { type: 'boolean', required: true } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args) => { await this.removeTask(args.id); return { removed: true } },
    })), 'tasks: remove tool')
  }

  private async addTask(request: TaskAddRequest): Promise<TaskRecord> {
    const title = request.title.trim()
    if (title === '') throw new TaskError('task title must not be empty', 'TASK_INVALID')
    const table = await this.table()
    if ([...table.entries()].length >= this.config.maxTasks) throw new TaskError(`task limit ${String(this.config.maxTasks)} reached`, 'TASK_LIMIT')
    const now = new Date().toISOString()
    const dueAt = dueDate(request.dueAt)
    const record: TaskRecord = {
      id: randomUUID(), title, status: 'open', priority: request.priority ?? 'normal',
      filePaths: [...(request.filePaths ?? [])], tags: tagsOf(request.tags),
      createdAt: now, updatedAt: now,
      ...dueAt === undefined ? {} : { dueAt },
      ...request.notes === undefined ? {} : { notes: request.notes },
      ...request.sourceSessionId === undefined ? {} : { sourceSessionId: request.sourceSessionId },
      ...request.sourceEventId === undefined ? {} : { sourceEventId: request.sourceEventId },
    }
    await table.put(record.id, record)
    return record
  }

  private async listTasks(filter: TaskListRequest): Promise<readonly TaskRecord[]> {
    const status = filter.status ?? 'open'
    const tasks = [...(await this.table()).entries()].map(([, record]) => record)
      .filter(record => status === 'all' || record.status === status)
      .filter(record => filter.tag === undefined || record.tags.includes(filter.tag))
      .filter(record => filter.filePath === undefined || record.filePaths.includes(filter.filePath))
      .sort(compareTasks)
    return tasks.slice(0, Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), this.config.maxList))
  }

  private async viewTask(id: string): Promise<TaskRecord> {
    const record = (await this.table()).get(id)
    if (record === undefined) throw new TaskError(`task ${id} was not found`, 'TASK_NOT_FOUND')
    return record
  }

  private async updateTask(id: string, patch: TaskUpdatePatch): Promise<TaskRecord> {
    const table = await this.table()
    const record = table.get(id)
    if (record === undefined) throw new TaskError(`task ${id} was not found`, 'TASK_NOT_FOUND')
    if (patch.title !== undefined && patch.title.trim() === '') throw new TaskError('task title must not be empty', 'TASK_INVALID')
    const now = new Date().toISOString()
    const next: TaskRecord = {
      ...record,
      ...patch.title === undefined ? {} : { title: patch.title.trim() },
      ...patch.priority === undefined ? {} : { priority: patch.priority },
      ...patch.filePaths === undefined ? {} : { filePaths: [...patch.filePaths] },
      ...patch.tags === undefined ? {} : { tags: tagsOf(patch.tags) },
      updatedAt: now,
    }
    if (patch.dueAt === null) delete next.dueAt
    else if (patch.dueAt !== undefined) next.dueAt = dueDate(patch.dueAt)
    if (patch.notes === null) delete next.notes
    else if (patch.notes !== undefined) next.notes = patch.notes
    if (patch.status !== undefined && patch.status !== record.status) {
      next.status = patch.status
      if (patch.status === 'done') next.completedAt = now
      else delete next.completedAt
    }
    await table.put(id, next)
    return next
  }

  private async removeTask(id: string): Promise<void> {
    const table = await this.table()
    if (table.get(id) === undefined) throw new TaskError(`task ${id} was not found`, 'TASK_NOT_FOUND')
    await table.delete(id)
  }

  private table(): Promise<KvTable<string, TaskRecord>> {
    this.opened ??= this.ctx.storageDomain.open(tasksDomain).then((domain) => {
      this.ctx.effect(() => () => domain.close(), 'tasks: domain')
      return domain.table('tasks')
    }, (error: unknown) => {
      this.opened = undefined
      throw error
    })
    return this.opened
  }


}

/** Cordis service name. */
export const name = 'tasks'
/** Services the plugin needs. */
export const inject = ['storageDomain']
