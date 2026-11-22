/**
 * Remote contribution and tag-panel registration lifecycle. The Remote is
 * mounted before the panel asks for `remote.fileTags`, and both are withdrawn
 * together with the plugin.
 * @module @deepseek-ai/dsh-client-ui-filetags/mount
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { SearchRequest, TaggedEntry, TagRequest, TagSummary } from '@deepseek-ai/dsh-filetags/types'
import type { FiletagsFace } from './face.ts'
import { TagPanel } from './FiletagsBody.tsx'
import { filetagsDefinition, FILETAGS_ID } from './definition.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.ts'

/** Services the panel needs once its Remote is mounted. */
export const inject = ['remote', 'slots', 'locale', 'sidebarRightTabs']

/**
 * Whether a failure means the caller supplied a malformed path, tag, or expression.
 * @param error - failure raised by a Remote call.
 * @returns true for the invalid-argument code.
 */
function invalidArgument(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'filetags/invalid-argument'
}

/** The generated `fileTags` namespace as the browser face calls it. */
export interface FileTagsNamespace {
  /** Read every tag with its path count. */
  listTags(signal?: AbortSignal): Promise<RemoteResult<readonly TagSummary[]>>
  /** Run one tag expression. */
  search(request: SearchRequest, signal?: AbortSignal): Promise<RemoteResult<readonly TaggedEntry[]>>
  /** Attach tags to paths. */
  tag(request: TagRequest, signal?: AbortSignal): Promise<RemoteResult<number>>
  /** Detach tags from paths. */
  untag(request: TagRequest, signal?: AbortSignal): Promise<RemoteResult<number>>
}

/**
 * Bind the panel's face to the generated namespace, unwrapping each result.
 * @param remote - the mounted `fileTags` namespace.
 * @returns the tag operations the panel body calls.
 */
export function createFace(remote: FileTagsNamespace): FiletagsFace {
  return {
    listTags: async (signal) => {
      const result = await remote.listTags(signal)
      if (!result.ok) throw result.error
      return result.value
    },
    search: async (expression, signal) => {
      const result = await remote.search({ expression }, signal)
      if (!result.ok) throw result.error
      return result.value
    },
    tag: async (path, names, signal) => {
      const result = await remote.tag({ paths: [path], tags: [...names] }, signal)
      if (!result.ok) throw result.error
    },
    untag: async (path, name, signal) => {
      const result = await remote.untag({ paths: [path], tags: [name] }, signal)
      if (!result.ok) throw result.error
    },
    invalidArgument,
  }
}

/**
 * Register dictionaries, the tab type, and the body and title seats.
 * @param ctx - Client context carrying the Remote mount.
 * @param lifetime - aborts panel reads when the plugin unloads.
 */
function registerPanel(ctx: Context, lifetime: AbortController): void {
  const face = createFace(ctx.remote.fileTags)
  ctx.effect(() => () => { lifetime.abort() }, 'filetags-ui: panel reads')
  ctx.effect(() => ctx.locale.register(NS, { en, zh, ja, es, fr, de, ru, pt }), 'filetags-ui: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(filetagsDefinition(ctx.locale.bind(NS))), 'filetags-ui: tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: FILETAGS_ID, locale: NS, inject: () => ({ face }) },
    TagPanel,
  )), 'filetags-ui: tab body')
}

/**
 * Mount the tag panel and the Remote it reads.
 * @param ctx - Client plugin lifetime.
 * @param contribution - generated `fileTags` Remote definitions.
 * @returns disposer that withdraws the panel before its Remote.
 */
export async function mountFiletags(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'filetags-ui: cancellation')
  const unmountRemote = await ctx.remote.$mount(contribution)
  const panel = ctx.inject(['remote.fileTags', 'slots', 'locale', 'sidebarRightTabs'], child => registerPanel(child, lifetime))
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

export type { TaggedEntry, TagSummary }
