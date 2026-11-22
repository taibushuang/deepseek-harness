/**
 * Schema and open-time sequence for the central file-tag database: owner-only
 * creation, pragmas, and the `PRAGMA user_version` stamp that rejects any other
 * layout instead of migrating it in place.
 * @module @deepseek-ai/dsh-experimental-filetags/schema
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

/** The on-disk layout version, stored in `PRAGMA user_version`. */
export const FILETAGS_SCHEMA_VERSION = 1

/**
 * Exclusively create a missing database file with owner-only permissions.
 * Existing files keep their modes, and errors other than `EEXIST` propagate.
 * @param path - absolute database file path.
 */
async function createDatabaseFile(path: string): Promise<void> {
  try {
    const handle = await open(path, 'wx', 0o600)
    await handle.close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

/**
 * Open the file-tag database and ensure its schema. Missing directories and the
 * database file are created owner-only; `:memory:` skips filesystem setup.
 * @param path - database file to open, or `:memory:`.
 * @returns the open handle with pragmas applied and tables ensured.
 */
export async function openFiletagsDatabase(path: string): Promise<DatabaseSync> {
  const actual = path === ':memory:' ? path : resolve(path)
  if (actual !== ':memory:') {
    await mkdir(dirname(actual), { recursive: true, mode: 0o700 })
    await createDatabaseFile(actual)
  }
  const db = new DatabaseSync(actual)
  try {
    configure(db, actual)
    return db
  } catch (error: unknown) {
    db.close()
    throw error
  }
}

function configure(db: DatabaseSync, path: string): void {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  const { user_version: onDisk } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (onDisk !== 0 && onDisk !== FILETAGS_SCHEMA_VERSION) {
    throw new Error(`file-tag database at "${path}" has schema version ${onDisk}, incompatible with this build (${FILETAGS_SCHEMA_VERSION})`)
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    ) STRICT
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id          INTEGER PRIMARY KEY,
      path        TEXT NOT NULL UNIQUE,
      is_dir      INTEGER NOT NULL CHECK (is_dir IN (0, 1)),
      fingerprint TEXT NOT NULL,
      size        INTEGER NOT NULL,
      mod_time    INTEGER NOT NULL,
      missing     INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1))
    ) STRICT
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS entry_tags (
      entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (entry_id, tag_id)
    ) STRICT
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag_id)')
  if (onDisk === 0) db.exec(`PRAGMA user_version = ${FILETAGS_SCHEMA_VERSION}`)
}
