/**
 * Stage one of the panel registration: the `tags` tab type and the key its body
 * registers under.
 * @module @deepseek-ai/dsh-client-ui-filetags/definition
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const FILETAGS_KIND = 'tags'

/** This implementation's identity in the tab system, and the key its body and title register under. */
export const FILETAGS_ID = '@deepseek-ai/dsh-client-ui-filetags'

/**
 * The tag panel's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function filetagsDefinition(t: TranslateNS<'filetags'>): SidebarRightTabDefinition {
  return {
    id: FILETAGS_ID,
    kind: FILETAGS_KIND,
    priority: 'builtin',
    title: () => t('type.label'),
  }
}
