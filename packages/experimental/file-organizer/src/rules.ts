/**
 * Rule validation and the pure planning step: one directory's direct files,
 * first matching glob wins, and every destination stays inside that directory.
 * @module @deepseek-ai/dsh-file-organizer/rules
 */

import { isAbsolute, join } from 'node:path'
import picomatch from 'picomatch'
import type { FsDirEntry } from '@deepseek-ai/dsh-fs'
import { OrganizerError } from './error.ts'

/** One model-supplied rule: a basename glob and a relative target directory. */
export interface OrganizeRule {
  /** Glob matched against the file's basename, for example `*.pdf`. */
  readonly pattern: string
  /** Relative directory below the destination root, for example `documents`. */
  readonly target: string
  /** Tags attached to the moved file, when a tag writer is mounted. */
  readonly tags?: readonly string[]
}

/** One planned move. */
export interface PlannedMove {
  /** Absolute source path. */
  readonly from: string
  /** Absolute destination path. */
  readonly to: string
  /** Tags to attach after a successful move. */
  readonly tags?: readonly string[]
}

/** One file the plan leaves alone. */
export interface PlannedSkip {
  /** Absolute path. */
  readonly path: string
  /** Machine-stable reason. */
  readonly reason: string
}

/** Result of planning one directory. */
export interface OrganizePlan {
  readonly moves: readonly PlannedMove[]
  readonly skipped: readonly PlannedSkip[]
}

/** A compiled rule ready to match basenames. */
interface CompiledRule {
  readonly matches: (name: string) => boolean
  readonly target: string
  readonly tags?: readonly string[]
}

/**
 * Normalize and validate one relative target directory.
 * @param target - model-supplied target.
 * @returns the POSIX-normalized relative path.
 * @throws {OrganizerError} when the target is absolute, escapes the directory, or is empty.
 */
export function normalizeTarget(target: string): string {
  if (target.includes('\0')) throw new OrganizerError('rule target must not contain NUL bytes', 'ORGANIZER_INVALID_RULE')
  const normalized = target.replaceAll('\\', '/').replace(/\/+$/u, '').replace(/^\.\//u, '')
  if (normalized === '' || normalized === '.') {
    throw new OrganizerError('rule target must name a directory below the organized directory', 'ORGANIZER_INVALID_RULE')
  }
  if (isAbsolute(normalized) || normalized.split('/').some(segment => segment === '..' || segment === '')) {
    throw new OrganizerError(`rule target ${JSON.stringify(target)} must stay below the organized directory`, 'ORGANIZER_INVALID_RULE')
  }
  return normalized
}

/**
 * Compile the model's rules, preserving order.
 * @param rules - rule list.
 * @returns matchers with normalized targets.
 * @throws {OrganizerError} for an empty pattern or an invalid target.
 */
export function compileRules(rules: readonly OrganizeRule[]): CompiledRule[] {
  return rules.map((rule) => {
    if (rule.pattern.trim() === '') {
      throw new OrganizerError('rule pattern must not be empty', 'ORGANIZER_INVALID_RULE')
    }
    const target = normalizeTarget(rule.target)
    const matches = picomatch(rule.pattern, { nocase: true, dot: false })
    const tags = rule.tags?.map((tag) => {
      if (tag.trim() === '' || /\s/u.test(tag)) {
        throw new OrganizerError(`rule tag ${JSON.stringify(tag)} must be one word without whitespace`, 'ORGANIZER_INVALID_RULE')
      }
      return tag
    })
    return { matches, target, ...tags === undefined ? {} : { tags } }
  })
}

/**
 * Plan moves for one directory listing. Directories, hidden names, and other
 * non-file entries are skipped; the first matching rule wins; files matching no
 * rule use `othersTarget` when provided.
 * @param destinationRoot - absolute root the target directories live under.
 * @param entries - the organized directory's direct children.
 * @param rules - compiled rules.
 * @param othersTarget - optional normalized target for unmatched files.
 * @param othersTags - tags for unmatched files.
 * @returns moves in listing order and skips with stable reasons.
 */
export function planMoves(
  destinationRoot: string,
  entries: readonly FsDirEntry[],
  rules: readonly CompiledRule[],
  othersTarget: string | undefined,
  othersTags?: readonly string[],
): OrganizePlan {
  const moves: PlannedMove[] = []
  const skipped: PlannedSkip[] = []
  for (const entry of entries) {
    if (entry.type !== 'file') {
      skipped.push({ path: entry.target.displayPath, reason: 'not-a-file' })
      continue
    }
    if (entry.name.startsWith('.')) {
      skipped.push({ path: entry.target.displayPath, reason: 'hidden' })
      continue
    }
    const rule = rules.find(candidate => candidate.matches(entry.name))
    const target = rule?.target ?? othersTarget
    if (target === undefined) {
      skipped.push({ path: entry.target.displayPath, reason: 'unmatched' })
      continue
    }
    const tags = rule?.tags ?? othersTags
    moves.push({
      from: entry.target.displayPath,
      to: join(destinationRoot, target, entry.name),
      ...tags === undefined ? {} : { tags },
    })
  }
  return { moves, skipped }
}
