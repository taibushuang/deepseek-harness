/**
 * Open-time contract of the tag database: owner-only creation, version
 * rejection instead of migration, and the in-memory form used by tests.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FILETAGS_SCHEMA_VERSION, openFiletagsDatabase } from '../src/schema.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Create a temporary directory for one case.
 * @returns the directory path.
 */
async function scratch(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-filetags-schema-'))
  return root
}

describe('openFiletagsDatabase', () => {
  it('creates the file owner-only, stamps the layout once, and reopens it', async () => {
    const base = await scratch()
    const path = join(base, 'nested', 'filetags.db')
    const first = await openFiletagsDatabase(path)
    expect((first.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(FILETAGS_SCHEMA_VERSION)
    first.close()
    const second = await openFiletagsDatabase(path)
    second.close()
  })

  it('accepts the in-memory form without touching the filesystem', async () => {
    const db = await openFiletagsDatabase(':memory:')
    expect(db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all('table')).toBeDefined()
    db.close()
  })

  it('rejects another stored layout and closes the handle', async () => {
    const base = await scratch()
    const path = join(base, 'filetags.db')
    const stamped = new DatabaseSync(path)
    stamped.exec('PRAGMA user_version = 99')
    stamped.close()
    await expect(openFiletagsDatabase(path)).rejects.toThrow(`schema version 99, incompatible with this build (${FILETAGS_SCHEMA_VERSION})`)
  })

  it('propagates an error other than an existing database file', async () => {
    const base = await scratch()
    await expect(openFiletagsDatabase(join(base, 'invalid\u0000.db'))).rejects.toThrow()
  })

  it('propagates an error when the parent cannot be created', async () => {
    const base = await scratch()
    const blocker = join(base, 'blocker')
    await writeFile(blocker, 'x')
    await expect(openFiletagsDatabase(join(blocker, 'filetags.db'))).rejects.toThrow()
  })
})
