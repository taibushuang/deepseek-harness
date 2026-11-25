/**
 * Durable personal tasks: six model tools, a `tasks` Remote namespace, and one
 * `storage-domain` table shared by chat and the right Sidebar.
 * @module @deepseek-ai/dsh-tasks
 */

import { Tasks, type TasksConfig } from './service.ts'

export { Tasks } from './service.ts'
export type { TasksConfig } from './service.ts'
export type * from './types.ts'
export { TaskError } from './error.ts'
export type { TaskErrorCode } from './error.ts'

/** Plugin configuration. */
export interface Config extends TasksConfig {}


/** Default export consumed as the Cordis class plugin. */
export default Tasks
