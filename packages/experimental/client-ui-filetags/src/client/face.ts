/**
 * The business face the panel body receives: Remote calls with their results
 * unwrapped, so the component never sees the wire envelope.
 * @module @deepseek-ai/dsh-client-ui-filetags/face
 */

import type { TaggedEntry, TagSummary } from '@deepseek-ai/dsh-filetags/types'

/** Tag operations the panel body calls. */
export interface FiletagsFace {
  /** Read every tag with its path count. */
  listTags(signal: AbortSignal): Promise<readonly TagSummary[]>
  /** Run one tag expression. */
  search(expression: string, signal: AbortSignal): Promise<readonly TaggedEntry[]>
  /** Attach names to one path. */
  tag(path: string, names: readonly string[], signal: AbortSignal): Promise<void>
  /** Detach one name from one path. */
  untag(path: string, name: string, signal: AbortSignal): Promise<void>
  /** Whether a failure means the caller supplied a malformed path, tag, or expression. */
  invalidArgument(error: unknown): boolean
  /** Whether this page can hand a path to a Desktop application. */
  canOpen(signal: AbortSignal): Promise<boolean>
  /** Open one absolute path in its Desktop application. */
  open(path: string, signal: AbortSignal): Promise<void>
}

/** The native opening surface the panel borrows when the product provides one. */
export interface OpenInAppCapability {
  /** Whether a Host desktop answered for this page. */
  available(): Promise<boolean>
  /** Open one absolute Host path in its default application. */
  open(path: string): Promise<{ readonly kind: string }>
}
