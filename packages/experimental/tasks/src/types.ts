/** Shared task records and request shapes for tools and the right Sidebar. */
import { z } from 'zod'

/** Lifecycle of one personal task. */
export const taskStatus = z.enum(['open', 'done'])

/** User-set priority. */
export const taskPriority = z.enum(['low', 'normal', 'high'])

/** One durable task. */
export const task = z.object({
  id: z.string(),
  title: z.string(),
  status: taskStatus,
  priority: taskPriority,
  dueAt: z.string().optional(),
  filePaths: z.array(z.string()),
  tags: z.array(z.string()),
  notes: z.string().optional(),
  sourceSessionId: z.string().optional(),
  sourceEventId: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
})

/** Stored task. */
export type TaskRecord = z.infer<typeof task>

/** One task as the browser sees it. */
export type TaskView = TaskRecord

/** Add request shared by the tool and Remote. */
export interface TaskAddRequest {
  readonly title: string
  readonly dueAt?: string
  readonly priority?: TaskRecord['priority']
  readonly filePaths?: readonly string[]
  readonly tags?: readonly string[]
  readonly notes?: string
  readonly sourceSessionId?: string
  readonly sourceEventId?: number
}

/** Fields the owner may change. */
export interface TaskUpdatePatch {
  readonly title?: string
  readonly dueAt?: string | null
  readonly priority?: TaskRecord['priority']
  readonly filePaths?: readonly string[]
  readonly tags?: readonly string[]
  readonly notes?: string | null
  readonly status?: TaskRecord['status']
}

/** Update request. */
export interface TaskUpdateRequest {
  readonly id: string
  readonly patch: TaskUpdatePatch
}

/** Completion request. */
export interface TaskCompleteRequest {
  readonly id: string
  readonly done?: boolean
}

/** View request. */
export interface TaskViewRequest {
  readonly id: string
}

/** Remove request. */
export interface TaskRemoveRequest {
  readonly id: string
}

/** List request used by the browser; tools filter through the service. */
export interface TaskListRequest {
  readonly status?: TaskRecord['status'] | 'all'
  readonly tag?: string
  readonly filePath?: string
  readonly limit?: number
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'tasks/not-found': { readonly id: string }
    'tasks/invalid': { readonly reason: string }
  }
}
