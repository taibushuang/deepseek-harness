/**
 * Browser entry for the right Sidebar tag panel.
 * @module @deepseek-ai/dsh-client-ui-filetags/client
 */

import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-filetags/remote'
import { mountFiletags } from './mount.ts'

export { inject } from './mount.ts'
export type { TagPanelProps } from './FiletagsBody.tsx'
export type { FiletagsFace } from './face.ts'
export type { FiletagsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { filetags: import('./locales.ts').FiletagsKey }
}

/**
 * Mount the tag panel and its Remote contribution.
 * @param ctx - browser plugin context.
 * @returns disposer joining panel and Remote withdrawal.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountFiletags(ctx, remote)
}
