/** Register the file-organizer card body and its copy. */
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-action-cards/client'
import type { FileOrganizerKey } from './locales.ts'
import { OrganizerCardBody } from './Card.tsx'
import { NS, dictionaries } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { fileOrganizer: FileOrganizerKey }
}

/** Services the body uses; `actionCards` provides the frame and action dispatch. */
export const inject = ['locale', 'actionCards']

/**
 * Register the body for the Host kind's lifetime.
 * @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'file-organizer: locale')
  ctx.effect(() => ctx.actionCards.register({
    action: 'organize_files',
    locale: NS,
    Body: props => createElement(OrganizerCardBody, props),
  }), 'file-organizer: card body')
}
