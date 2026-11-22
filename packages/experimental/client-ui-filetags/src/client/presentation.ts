/**
 * Pure panel derivations: the tag expression a chip selection represents, and
 * the two in-memory filters the Client search rule governs (tag names as fuzzy
 * keys, paths as contiguous substrings).
 * @module @deepseek-ai/dsh-client-ui-filetags/presentation
 */

import { TextSearchIndex } from '@deepseek-ai/dsh-util-text-search'
import type { TaggedEntry, TagSummary } from '@deepseek-ai/dsh-filetags/types'

/**
 * Build the expression a set of selected tags stands for.
 * @param selected - tag names in selection order.
 * @returns the conjunction, or the empty string when nothing is selected.
 */
export function expressionOf(selected: readonly string[]): string {
  return selected.join(' and ')
}

/**
 * Toggle one tag in a selection.
 * @param selected - current selection.
 * @param name - tag to add or remove.
 * @returns the next selection, keeping the order tags were added in.
 */
export function toggleTag(selected: readonly string[], name: string): readonly string[] {
  return selected.includes(name) ? selected.filter(tag => tag !== name) : [...selected, name]
}

/**
 * Filter tags by a query.
 * @param tags - tags in display order.
 * @param query - user text.
 * @returns matching tags, best match first; the input order when the query is blank.
 */
export function filterTags(tags: readonly TagSummary[], query: string): readonly TagSummary[] {
  const index = new TextSearchIndex(tags, tag => ({ fuzzy: [tag.name] }))
  return index.search(query)
}

/**
 * Filter tagged entries by a path query.
 * @param entries - entries in display order.
 * @param query - user text; each term must occur as a contiguous substring.
 * @returns matching entries in display order.
 */
export function filterEntries(entries: readonly TaggedEntry[], query: string): readonly TaggedEntry[] {
  const index = new TextSearchIndex(entries, entry => ({ substring: [entry.path] }))
  return index.search(query)
}

/**
 * Split a comma- or space-separated tag input into candidate names.
 * @param text - editor text.
 * @returns non-empty names in the order typed.
 */
export function tagNamesOf(text: string): readonly string[] {
  return text.split(/[\s,]+/u).filter(name => name !== '')
}
