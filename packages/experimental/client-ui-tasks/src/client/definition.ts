/** Task tab registration. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const TASKS_KIND = 'tasks'
/** This implementation's identity in the tab system. */
export const TASKS_ID = '@deepseek-ai/dsh-client-ui-tasks'

/**
 * The task panel's registry definition.
 * @param t - namespace-bound translate.
 * @returns the definition to register.
 */
export function tasksDefinition(t: TranslateNS<'tasks'>): SidebarRightTabDefinition {
  return {
    id: TASKS_ID,
    kind: TASKS_KIND,
    priority: 'builtin',
    title: () => t('type.label'),
    guide: [{ id: 'tasks', order: 50, title: () => t('type.label'), description: () => t('guide.description') }],
  }
}
