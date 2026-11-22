/**
 * Client-safe file-tag records and the Remote failure codes the browser face
 * switches on. No Node or database types cross this module.
 * @module @deepseek-ai/dsh-filetags/types
 */

import type {} from '@deepseek-ai/dsh-typert-protocol'

/** One tagged path with its tags, sorted by name. */
export interface TaggedEntry {
  /** Absolute path of the file or directory. */
  readonly path: string
  /** Whether the path is a directory. */
  readonly isDir: boolean
  /** Tag names on the path, sorted by name. */
  readonly tags: readonly string[]
}

/** One tag and the number of paths that carry it. */
export interface TagSummary {
  /** Tag name. */
  readonly name: string
  /** Number of tagged paths. */
  readonly count: number
}

/** One tag-or-expression operation requested by the browser face. */
export interface TagRequest {
  /** Absolute paths to change. */
  readonly paths: readonly string[]
  /** Tag names to attach or detach. */
  readonly tags: readonly string[]
}

/** One tag-expression search requested by the browser face. */
export interface SearchRequest {
  /** Tag expression, for example `project and not archive`. */
  readonly expression: string
  /** Maximum number of entries to return; the Host caps it at its own limit. */
  readonly limit?: number
}

/** One path lookup requested by the browser face. */
export interface EntryRequest {
  /** Absolute path whose tags to read. */
  readonly path: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A path was relative, a tag name was reserved or malformed, or an expression did not parse. */
    'filetags/invalid-argument': Record<string, never>
    /** The database could not be read or written; the message carries the failure. */
    'filetags/failed': Record<string, never>
  }
}
