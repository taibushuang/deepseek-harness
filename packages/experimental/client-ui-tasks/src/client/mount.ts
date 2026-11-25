/** Remote contribution and task-panel registration lifecycle. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { TaskPanel } from './TaskPanel.tsx'
import { TASKS_ID, tasksDefinition } from './definition.ts'
import { createFace, type TasksNamespace } from './face.ts'
import { dictionaries, NS, type TasksKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { tasks: TasksKey }
}

/** Services the panel needs once its Remote is mounted. */
export const inject = ['remote', 'slots', 'locale', 'sidebarRightTabs']

/**
 * Register dictionaries, the tab type, and the body seat.
 * @param ctx - Client context carrying the Remote mount.
 * @param lifetime - aborts panel reads when the plugin unloads.
 */
function registerPanel(ctx: Context, lifetime: AbortController): void {
  const face = createFace(ctx.remote.tasks as TasksNamespace)
  ctx.effect(() => () => { lifetime.abort() }, 'tasks-ui: panel reads')
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'tasks-ui: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(tasksDefinition(ctx.locale.bind(NS))), 'tasks-ui: tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TASKS_ID, locale: NS, inject: () => ({ face, lifetime: lifetime.signal }) },
    TaskPanel,
  )), 'tasks-ui: tab body')
}

/**
 * Mount the task panel and the Remote it reads.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated `tasks` Remote definitions.
 * @returns disposer that withdraws the panel before its Remote.
 */
export async function mountTasks(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'tasks-ui: cancellation')
  const unmountRemote = await ctx.remote.$mount(contribution)
  const panel = ctx.inject(['remote.tasks', 'slots', 'locale', 'sidebarRightTabs'], child => registerPanel(child, lifetime))
  try {
    await panel
  } catch (error) {
    await panel.dispose()
    await unmountRemote()
    throw error
  }
  return async () => {
    await panel.dispose()
    await unmountRemote()
  }
}
