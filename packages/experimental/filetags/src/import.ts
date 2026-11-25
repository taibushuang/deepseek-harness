/** Read-only parsing of TagSpaces `.ts` metadata and bracket tags. */

/** One file and the tags found in its directory metadata or filename. */
export interface ImportEntry {
  /** Path as named by the metadata, relative to the directory holding `.ts`. */
  readonly relativePath: string
  readonly tags: readonly string[]
}

/** One tag object in a TagSpaces `tsi.json` entry. */
interface TsiTag {
  readonly title?: unknown
}

/** One entry in a TagSpaces `tsi.json` array. */
interface TsiEntry {
  readonly path?: unknown
  readonly tags?: unknown
}

/**
 * Parse one `tsi.json` document, tolerating a UTF-8 BOM.
 * @param text - file contents.
 * @returns entries that name a path and at least one one-word tag.
 */
export function parseTsi(text: string): ImportEntry[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/u, ''))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const entries: ImportEntry[] = []
  for (const candidate of parsed) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const entry = candidate as TsiEntry
    if (typeof entry.path !== 'string' || entry.path.trim() === '') continue
    const tags = Array.isArray(entry.tags)
      ? entry.tags.flatMap((tag: TsiTag) => typeof tag === 'object' && tag !== null && typeof tag.title === 'string'
        ? [tag.title]
        : [])
      : []
    const valid = tags.map(tag => tag.trim()).filter(tag => tag !== '' && !/\s/u.test(tag))
    if (valid.length > 0) entries.push({ relativePath: entry.path.replaceAll('\\', '/'), tags: valid })
  }
  return entries
}

/**
 * Read tags encoded as `[tag another]` in a file name.
 * @param name - basename.
 * @returns one-word tags from every bracket group.
 */
export function bracketTags(name: string): string[] {
  const tags: string[] = []
  for (const match of name.matchAll(/\[([^\]]+)\]/gu)) {
    for (const token of (match[1] ?? '').split(/\s+/u)) {
      const tag = token.trim()
      if (tag !== '' && !/[()\\/]/u.test(tag)) tags.push(tag)
    }
  }
  return tags
}
