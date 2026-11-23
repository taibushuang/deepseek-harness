/** The organizer service over real files and the JSON storage domain. */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileOrganizer } from '../src/service.ts'

let base: string
let ctx: Context
let fiber: Awaited<ReturnType<Context['plugin']>>
let organizer: FileOrganizer

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'dsh-organizer-')))
  ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root: join(base, '.storage') })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  fiber = await ctx.plugin(LocalFileSystem, { cwd: base })
  organizer = new FileOrganizer(ctx, { maxFiles: 100, maxDisplayEntries: 50, maxHistory: 10 })
})
afterEach(async () => {
  await fiber.dispose()
  await ctx.fiber.dispose()
  await rm(base, { recursive: true, force: true })
})

/**
 * Create a directory of direct files.
 * @param name - directory name.
 * @param files - file names to create.
 * @returns the absolute directory.
 */
async function directory(name: string, files: readonly string[]): Promise<string> {
  const path = join(base, name)
  await mkdir(path)
  for (const file of files) await writeFile(join(path, file), file)
  return path
}

const RULES = [
  { pattern: '*.pdf', target: 'documents' },
  { pattern: '*.png', target: 'images' },
]

describe('preview', () => {
  it('plans first-match moves and explains every skip', async () => {
    const path = await directory('inbox', ['a.pdf', 'b.png', 'c.txt', '.hidden.pdf'])
    await mkdir(join(path, 'folder.pdf'))
    await mkdir(join(path, 'documents'))
    await writeFile(join(path, 'documents', 'a.pdf'), 'existing')
    const result = await organizer.preview({ directory: path, rules: RULES, othersTarget: 'other' })
    expect(result.totalMoves).toBe(2)
    expect(result.moves.map(move => relative(result.directory, move.to))).toEqual([
      join('images', 'b.png'), join('other', 'c.txt'),
    ])
    expect(result.skipped).toEqual(expect.arrayContaining([
      { path: join(path, 'documents', 'a.pdf'), reason: 'exists' },
      { path: join(path, 'folder.pdf'), reason: 'not-a-file' },
      { path: join(path, '.hidden.pdf'), reason: 'hidden' },
    ]))
    expect((await organizer.history())[0]).toMatchObject({ batchId: result.batchId, status: 'planned', moves: 2 })
    const second = await organizer.preview({ directory: await directory('inbox1b', ['x.pdf']), rules: RULES })
    const history = await organizer.history()
    expect(history.map(batch => batch.batchId)).toEqual([second.batchId, result.batchId])
  })

  it('leaves unmatched files alone when no fallback target is given', async () => {
    const path = await directory('inbox2', ['a.pdf', 'b.txt'])
    const result = await organizer.preview({ directory: path, rules: RULES })
    expect(result.totalMoves).toBe(1)
    expect(result.skipped).toEqual([{ path: join(path, 'b.txt'), reason: 'unmatched' }])
  })

  it('caps the scan and reports the rest as limited', async () => {
    const path = await directory('inbox3', ['a.pdf', 'b.pdf', 'c.pdf'])
    const small = new FileOrganizer(ctx, { maxFiles: 2, maxDisplayEntries: 1, maxHistory: 1 })
    const result = await small.preview({ directory: path, rules: RULES })
    expect(result.totalMoves).toBe(2)
    expect(result.moves).toHaveLength(1)
    expect(result.skipped).toEqual(expect.arrayContaining([{ path: join(path, 'c.pdf'), reason: 'limit' }]))
  })

  it('rejects an empty rule set, invalid rules, and invalid directories', async () => {
    const path = await directory('inbox4', ['a.pdf'])
    await expect(organizer.preview({ directory: path, rules: [] })).rejects.toMatchObject({ code: 'ORGANIZER_INVALID_RULE' })
    await expect(organizer.preview({ directory: path, rules: [{ pattern: '', target: 'x' }] }))
      .rejects.toMatchObject({ code: 'ORGANIZER_INVALID_RULE' })
    await expect(organizer.preview({ directory: path, rules: [{ pattern: '*', target: '../x' }] }))
      .rejects.toMatchObject({ code: 'ORGANIZER_INVALID_RULE' })
    await expect(organizer.preview({ directory: join(base, 'missing'), rules: RULES }))
      .rejects.toMatchObject({ code: 'ORGANIZER_INVALID_DIRECTORY' })
    await expect(organizer.preview({ directory: join(path, 'a.pdf'), rules: RULES }))
      .rejects.toMatchObject({ code: 'ORGANIZER_INVALID_DIRECTORY' })
  })
})

describe('apply and undo', () => {
  it('moves the planned files, refuses a second apply, and reverses on undo', async () => {
    const path = await directory('work', ['a.pdf', 'b.png'])
    const plan = await organizer.preview({ directory: path, rules: RULES })
    const applied = await organizer.apply(plan.batchId)
    expect(applied).toMatchObject({ status: 'applied', done: 2, failed: 0 })
    expect(await readFile(join(path, 'documents', 'a.pdf'), 'utf8')).toBe('a.pdf')
    expect(await readFile(join(path, 'images', 'b.png'), 'utf8')).toBe('b.png')
    await expect(organizer.apply(plan.batchId)).rejects.toMatchObject({ code: 'ORGANIZER_BATCH_STATE' })

    const undone = await organizer.undo(plan.batchId)
    expect(undone).toMatchObject({ status: 'undone', done: 2 })
    expect(await readFile(join(path, 'a.pdf'), 'utf8')).toBe('a.pdf')
    await expect(organizer.undo(plan.batchId)).rejects.toMatchObject({ code: 'ORGANIZER_BATCH_STATE' })
  })

  it('reports missing sources, occupied destinations, and busy batches', async () => {
    const path = await directory('work2', ['a.pdf', 'b.pdf', 'c.pdf'])
    const plan = await organizer.preview({ directory: path, rules: RULES })
    await rm(join(path, 'a.pdf'))
    await mkdir(join(path, 'documents', 'c.pdf'), { recursive: true })
    const applied = await organizer.apply(plan.batchId)
    expect(applied.status).toBe('partial')
    expect(applied.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'skipped', reason: 'missing' }),
      expect.objectContaining({ status: 'failed', reason: 'exists' }),
    ]))

    const other = await organizer.preview({ directory: await directory('work3', ['d.pdf']), rules: RULES })
    const first = organizer.apply(other.batchId)
    const second = organizer.apply(other.batchId)
    await expect(second).rejects.toMatchObject({ code: 'ORGANIZER_BUSY' })
    await first
  })

  it('leaves a file in place when its original path is occupied during undo', async () => {
    const path = await directory('work4', ['a.pdf'])
    const plan = await organizer.preview({ directory: path, rules: RULES })
    await organizer.apply(plan.batchId)
    await writeFile(join(path, 'a.pdf'), 'replacement')
    const undone = await organizer.undo(plan.batchId)
    expect(undone.status).toBe('undoPartial')
    expect(undone.outcomes[0]).toMatchObject({ status: 'undo-failed', reason: expect.stringContaining('occupied') })
    expect(await readFile(join(path, 'documents', 'a.pdf'), 'utf8')).toBe('a.pdf')
  })

  it('reports a source replaced by a directory and a transfer failure', async () => {
    const path = await directory('work5', ['a.pdf', 'b.pdf'])
    const plan = await organizer.preview({ directory: path, rules: RULES })
    await rm(join(path, 'a.pdf'))
    await mkdir(join(path, 'a.pdf'))
    const applied = await organizer.apply(plan.batchId)
    expect(applied.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: join(path, 'a.pdf'), status: 'failed', reason: 'not-a-file' }),
    ]))

    const failPlan = await organizer.preview({ directory: await directory('work6', ['c.pdf']), rules: RULES })
    const transfer = ctx.fs.transferFile.bind(ctx.fs)
    ctx.fs.transferFile = async () => { throw new Error('injected') }
    try {
      const result = await organizer.apply(failPlan.batchId)
      expect(result.outcomes[0]).toMatchObject({ status: 'failed', reason: 'Error: injected' })
    } finally {
      ctx.fs.transferFile = transfer
    }
  })

  it('skips non-applied moves and reports undo failures', async () => {
    const path = await directory('work7', ['a.pdf', 'b.pdf'])
    const plan = await organizer.preview({ directory: path, rules: RULES })
    await rm(join(path, 'b.pdf'))
    await organizer.apply(plan.batchId)
    const partial = await organizer.undo(plan.batchId)
    expect(partial.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'skipped', reason: 'not-applied' }),
    ]))

    const path2 = await directory('work8', ['c.pdf', 'd.pdf'])
    const plan2 = await organizer.preview({ directory: path2, rules: RULES })
    await organizer.apply(plan2.batchId)
    await rm(join(path2, 'documents', 'c.pdf'))
    await writeFile(join(path2, 'd.pdf'), 'occupied')
    const failed = await organizer.undo(plan2.batchId)
    expect(failed.status).toBe('undoPartial')
    expect(failed.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'undo-failed', reason: 'undo: destination missing' }),
      expect.objectContaining({ status: 'undo-failed', reason: expect.stringContaining('occupied') }),
    ]))
  })

  it('reports an injected undo transfer failure', async () => {
    const path = await directory('work9', ['e.pdf'])
    const plan = await organizer.preview({ directory: path, rules: RULES })
    await organizer.apply(plan.batchId)
    const transfer = ctx.fs.transferFile.bind(ctx.fs)
    ctx.fs.transferFile = async () => { throw new Error('undo boom') }
    try {
      expect((await organizer.undo(plan.batchId)).outcomes[0]).toMatchObject({ status: 'undo-failed', reason: 'undo: Error: undo boom' })
    } finally {
      ctx.fs.transferFile = transfer
    }
  })

  it('reports coded transfer failures for apply and undo', async () => {
    const path = await directory('work10', ['a.pdf'])
    const plan = await organizer.preview({ directory: path, rules: RULES })
    const transfer = ctx.fs.transferFile.bind(ctx.fs)
    ctx.fs.transferFile = async () => { throw new FsError('injected', 'FS_IO_ERROR') }
    try {
      expect((await organizer.apply(plan.batchId)).outcomes[0]).toMatchObject({ status: 'failed', reason: 'FS_IO_ERROR: injected' })
    } finally {
      ctx.fs.transferFile = transfer
    }

    const path2 = await directory('work11', ['b.pdf'])
    const plan2 = await organizer.preview({ directory: path2, rules: RULES })
    await organizer.apply(plan2.batchId)
    ctx.fs.transferFile = async () => { throw new FsError('undo injected', 'FS_IO_ERROR') }
    try {
      expect((await organizer.undo(plan2.batchId)).outcomes[0]).toMatchObject({ status: 'undo-failed', reason: 'undo: FS_IO_ERROR: undo injected' })
    } finally {
      ctx.fs.transferFile = transfer
    }
  })

  it('rejects unknown batches', async () => {
    await expect(organizer.apply('missing')).rejects.toMatchObject({ code: 'ORGANIZER_BATCH_NOT_FOUND' })
  })
})

describe('destination root and tagging', () => {
  it('moves inbox files into another tree and tags them', async () => {
    const inbox = await directory('inbox-tags', ['a.pdf'])
    const root = await directory('library', [])
    const calls: { paths: readonly string[]; tags: readonly string[] }[] = []
    const tagged = new FileOrganizer(ctx, { maxFiles: 100, maxDisplayEntries: 50, maxHistory: 10 }, () => ({
      tag: async (request) => { calls.push(request); return request.paths.length },
    }))
    const plan = await tagged.preview({
      directory: inbox,
      destinationRoot: root,
      rules: [{ pattern: '*.pdf', target: '项目', tags: ['需求', '待处理'] }],
    })
    expect(plan.moves[0]?.to).toBe(join(root, '项目', 'a.pdf'))
    expect(plan.moves[0]?.tags).toEqual(['需求', '待处理'])
    const applied = await tagged.apply(plan.batchId)
    expect(applied).toMatchObject({ status: 'applied', done: 1 })
    expect(calls).toEqual([{ paths: [join(root, '项目', 'a.pdf')], tags: ['需求', '待处理'] }])
  })

  it('keeps the move when tagging fails or no writer is mounted', async () => {
    const inbox = await directory('inbox-tagfail', ['a.pdf'])
    const failing = new FileOrganizer(ctx, { maxFiles: 10, maxDisplayEntries: 10, maxHistory: 10 }, () => ({
      tag: async () => { throw new Error('tag service down') },
    }))
    const plan = await failing.preview({ directory: inbox, rules: [{ pattern: '*.pdf', target: 'docs', tags: ['x'] }] })
    const applied = await failing.apply(plan.batchId)
    expect(applied.outcomes[0]).toMatchObject({ status: 'done', reason: 'tagging failed: Error: tag service down' })
    expect(await readFile(join(inbox, 'docs', 'a.pdf'), 'utf8')).toBe('a.pdf')
  })

  it('reports a coded tagging failure after the move', async () => {
    const inbox = await directory('inbox-tagfail2', ['b.pdf'])
    const coded = new FileOrganizer(ctx, { maxFiles: 10, maxDisplayEntries: 10, maxHistory: 10 }, () => ({
      tag: async () => { throw new FsError('denied', 'FS_PERMISSION_DENIED') },
    }))
    const plan = await coded.preview({ directory: inbox, rules: [{ pattern: '*.pdf', target: 'docs', tags: ['x'] }] })
    expect((await coded.apply(plan.batchId)).outcomes[0])
      .toMatchObject({ status: 'done', reason: 'tagging failed: FS_PERMISSION_DENIED: denied' })
  })

  it('reports tags it cannot write without a mounted filetags service', async () => {
    const inbox = await directory('inbox-notags', ['a.pdf'])
    const plan = await organizer.preview({ directory: inbox, rules: [{ pattern: '*.pdf', target: 'docs', tags: ['x'] }] })
    const applied = await organizer.apply(plan.batchId)
    expect(applied.outcomes[0]).toMatchObject({ status: 'done', reason: 'tagging unavailable: no tag writer is mounted' })
  })

  it('rejects a destination root that is missing or not a directory', async () => {
    const inbox = await directory('inbox-badroot', ['a.pdf'])
    await expect(organizer.preview({ directory: inbox, destinationRoot: join(base, 'missing-root'), rules: RULES }))
      .rejects.toMatchObject({ code: 'ORGANIZER_INVALID_DIRECTORY' })
    await expect(organizer.preview({ directory: inbox, destinationRoot: join(inbox, 'a.pdf'), rules: RULES }))
      .rejects.toMatchObject({ code: 'ORGANIZER_INVALID_DIRECTORY' })
  })
})
