/** Browser entry for the right Sidebar task panel. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-tasks/remote'
import { mountTasks } from './mount.ts'

export { inject } from './mount.ts'
export type { TaskPanelProps } from './TaskPanel.tsx'
export type { TasksFace } from './face.ts'
export type { TasksKey } from './locales.ts'

/**
 * Mount the task panel and its Remote contribution.
 * @param ctx - browser plugin context.
 * @returns disposer joining panel and Remote withdrawal.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountTasks(ctx, remote)
}
