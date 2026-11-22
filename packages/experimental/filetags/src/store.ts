/**
 * Central tag store: tags, tagged paths, and their links, kept in one SQLite
 * database outside every managed directory. Paths are absolute and unique, and
 * an entry without tags is removed so the table never accumulates dead rows.
 * @module @deepseek-ai/dsh-experimental-filetags/store
 */

import type { DatabaseSync } from 'node:sqlite'
import { stat } from 'node:fs/promises'
import { compileTagExpression } from './query.ts'
import type { TaggedEntry, TagSummary } from './types.ts'

/** Tag names: non-empty, no whitespace or parentheses, and not a query keyword. */
const TAG_NAME_RE = /^[^\s()]+$/
const RESERVED_TAG_NAMES = new Set(['and', 'or', 'not'])

/** A tag name rejected before it reaches the database. */
export class TagNameError extends Error {}

/** A path rejected because the store keys entries by absolute path. */
export class PathArgumentError extends Error {}

/**
 * Validate a tag name before it reaches the database.
 * @param name - candidate tag name.
 * @returns the name, unchanged.
 * @throws {TagNameError} when the name is empty, contains whitespace or parentheses, or is a query keyword.
 */
export function validateTagName(name: string): string {
  if (!TAG_NAME_RE.test(name)) throw new TagNameError(`invalid tag name "${name}": use one word without spaces or parentheses`)
  if (RESERVED_TAG_NAMES.has(name)) throw new TagNameError(`tag name "${name}" is reserved for queries`)
  return name
}

/** The tag database. One instance owns one open handle. */
export class FiletagStore {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Attach tags to paths. A path is recorded with its current type, size, and
   * modification time, and its existing record is refreshed.
   * @param paths - normalized absolute paths; each must exist.
   * @param tags - tag names, each checked by {@link validateTagName}.
   * @returns the number of paths tagged.
   */
  async tag(paths: string[], tags: string[]): Promise<number> {
    tags.forEach(validateTagName)
    const observed = await Promise.all(paths.map(async path => ({ path, info: await stat(path) })))
    const now = Date.now()
    this.transaction(() => {
      const tagIds = tags.map(name => this.ensureTag(name, now))
      for (const { path, info } of observed) {
        const fingerprint = `${info.size}:${info.mtimeMs}`
        this.db.prepare(`
          INSERT INTO entries (path, is_dir, fingerprint, size, mod_time, missing) VALUES (?, ?, ?, ?, ?, 0)
          ON CONFLICT(path) DO UPDATE SET is_dir = excluded.is_dir, fingerprint = excluded.fingerprint,
            size = excluded.size, mod_time = excluded.mod_time, missing = 0
        `).run(path, info.isDirectory() ? 1 : 0, fingerprint, info.size, Math.trunc(info.mtimeMs))
        const { id } = this.db.prepare('SELECT id FROM entries WHERE path = ?').get(path) as { id: number }
        const link = this.db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id, created_at) VALUES (?, ?, ?)')
        for (const tagId of tagIds) link.run(id, tagId, now)
      }
    })
    return observed.length
  }

  /**
   * Detach tags from paths and drop entries left without any tag.
   * @param paths - normalized absolute paths.
   * @param tags - tag names to detach; unknown names are ignored.
   * @returns the number of tag links removed.
   */
  untag(paths: string[], tags: string[]): number {
    let removed = 0
    this.transaction(() => {
      const remove = this.db.prepare(`
        DELETE FROM entry_tags WHERE entry_id = (SELECT id FROM entries WHERE path = ?)
        AND tag_id = (SELECT id FROM tags WHERE name = ?)
      `)
      for (const path of paths) {
        for (const name of tags) removed += Number(remove.run(path, name).changes)
      }
      this.db.exec('DELETE FROM entries WHERE id NOT IN (SELECT entry_id FROM entry_tags)')
      this.db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM entry_tags)')
    })
    return removed
  }

  /**
   * Find tagged paths matching a tag expression.
   * @param expression - tag expression such as `project and not archive`.
   * @param limit - maximum number of results.
   * @returns matching entries, sorted by path.
   */
  search(expression: string, limit: number): TaggedEntry[] {
    const { sql, params } = compileTagExpression(expression)
    const rows = this.db.prepare(`
      SELECT id, path, is_dir FROM entries WHERE ${sql} ORDER BY path LIMIT ?
    `).all(...params, limit) as { id: number; path: string; is_dir: number }[]
    return rows.map(row => ({ path: row.path, isDir: row.is_dir === 1, tags: this.tagsOf(row.id) }))
  }

  /**
   * List the tags attached to one path.
   * @param path - normalized absolute path.
   * @returns the tagged entry, or `undefined` when the path has no tags.
   */
  entry(path: string): TaggedEntry | undefined {
    const row = this.db.prepare('SELECT id, path, is_dir FROM entries WHERE path = ?').get(path) as
      | { id: number; path: string; is_dir: number } | undefined
    if (row === undefined) return undefined
    return { path: row.path, isDir: row.is_dir === 1, tags: this.tagsOf(row.id) }
  }

  /**
   * List every tag with its path count.
   * @returns tags sorted by name.
   */
  tags(): TagSummary[] {
    const rows = this.db.prepare(`
      SELECT t.name AS name, COUNT(et.entry_id) AS count
      FROM tags t JOIN entry_tags et ON et.tag_id = t.id
      GROUP BY t.id ORDER BY t.name
    `).all() as { name: string; count: number }[]
    return rows.map(row => ({ name: row.name, count: row.count }))
  }

  /** Close the database handle. */
  close(): void {
    this.db.close()
  }

  private tagsOf(entryId: number): string[] {
    const rows = this.db.prepare(`
      SELECT t.name AS name FROM entry_tags et JOIN tags t ON t.id = et.tag_id
      WHERE et.entry_id = ? ORDER BY t.name
    `).all(entryId) as { name: string }[]
    return rows.map(row => row.name)
  }

  private ensureTag(name: string, now: number): number {
    this.db.prepare('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)').run(name, now)
    const { id } = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: number }
    return id
  }

  private transaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      work()
      this.db.exec('COMMIT')
    } catch (error: unknown) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
