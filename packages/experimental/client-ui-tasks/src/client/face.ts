/** Task operations the panel calls, unwrapped from Remote results. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  TaskAddRequest, TaskCompleteRequest, TaskListRequest, TaskRemoveRequest, TaskView,
} from '@deepseek-ai/dsh-tasks/types'

/** Generated `tasks` namespace as the browser face calls it. */
export interface TasksNamespace {
  list(request: TaskListRequest, signal?: AbortSignal): Promise<RemoteResult<readonly TaskView[]>>
  add(request: TaskAddRequest, signal?: AbortSignal): Promise<RemoteResult<TaskView>>
  complete(request: TaskCompleteRequest, signal?: AbortSignal): Promise<RemoteResult<TaskView>>
  remove(request: TaskRemoveRequest, signal?: AbortSignal): Promise<RemoteResult<void>>
}

/** Panel operations after unwrapping failures. */
export interface TasksFace {
  list(signal?: AbortSignal): Promise<readonly TaskView[]>
  add(title: string): Promise<TaskView>
  complete(id: string, done: boolean): Promise<TaskView>
  remove(id: string): Promise<void>
}

/**
 * Bind the panel to the generated namespace.
 * @param remote - mounted `tasks` namespace.
 * @returns unwrapped operations.
 */
export function createFace(remote: TasksNamespace): TasksFace {
  return {
    list: async (signal) => {
      const result = await remote.list({ status: 'all', limit: 500 }, signal)
      if (!result.ok) throw result.error
      return result.value
    },
    add: async (title) => {
      const result = await remote.add({ title })
      if (!result.ok) throw result.error
      return result.value
    },
    complete: async (id, done) => {
      const result = await remote.complete({ id, done })
      if (!result.ok) throw result.error
      return result.value
    },
    remove: async (id) => {
      const result = await remote.remove({ id })
      if (!result.ok) throw result.error
    },
  }
}
