import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compileTagExpression, TagExpressionError } from '../src/query.ts'
import { openFiletagsDatabase } from '../src/schema.ts'
import { FiletagStore, TagNameError } from '../src/store.ts'

let root: string | undefined
let store: FiletagStore | undefined

afterEach(async () => {
  store?.close()
  store = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Open a store on a file under a fresh temporary directory, so paths in it exist.
 * @returns the store and the temporary root.
 */
async function open(): Promise<{ db: FiletagStore; base: string }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-filetags-store-'))
  store = new FiletagStore(await openFiletagsDatabase(join(root, 'filetags.db')))
  return { db: store, base: root }
}

describe('compileTagExpression precedence', () => {
  it('binds not tighter than and, and and tighter than or', () => {
    expect(compileTagExpression('a or b and not c').sql).toBe(
      '(EXISTS (SELECT 1 FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = entries.id AND t.name = ?)) OR '
      + '(EXISTS (SELECT 1 FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = entries.id AND t.name = ?) AND NOT (EXISTS (SELECT 1 FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = entries.id AND t.name = ?)))',
    )
    expect(compileTagExpression('a or b and not c').params).toEqual(['a', 'b', 'c'])
  })

  it.each(['', 'and', 'a and', '(a', 'a)', 'a b', 'not'])('rejects malformed expression %j', (expression) => {
    expect(() => compileTagExpression(expression)).toThrow(TagExpressionError)
  })
})

describe('FiletagStore', () => {
  it('records a path with its type and keeps it findable by tag expression', async () => {
    const { db, base } = await open()
    const file = join(base, 'a.txt')
    await writeFile(file, 'x')
    await mkdir(join(base, 'dir'))
    expect(await db.tag([file, join(base, 'dir')], ['project'])).toBe(2)
    expect(db.search('project', 10).map(entry => [entry.path, entry.isDir])).toEqual([
      [file, false],
      [join(base, 'dir'), true],
    ])
  })

  it('drops an entry and a tag once no link refers to them', async () => {
    const { db, base } = await open()
    const file = join(base, 'a.txt')
    await writeFile(file, 'x')
    await db.tag([file], ['draft', 'work'])
    expect(db.untag([file], ['draft'])).toBe(1)
    expect(db.tags()).toEqual([{ name: 'work', count: 1 }])
    expect(db.untag([file], ['work'])).toBe(1)
    expect(db.tags()).toEqual([])
    expect(db.entry(file)).toBeUndefined()
  })

  it('rejects invalid tag names before touching the database', async () => {
    const { db, base } = await open()
    const file = join(base, 'a.txt')
    await writeFile(file, 'x')
    await expect(db.tag([file], ['two words'])).rejects.toThrow(TagNameError)
    await expect(db.tag([file], ['or'])).rejects.toThrow(TagNameError)
    expect(db.tags()).toEqual([])
  })
})
