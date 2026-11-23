/** Byte-exact copy/move through the local provider: binary content, guards, and partial outcomes. */
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { FsTarget, FsVersion } from '@deepseek-ai/dsh-fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalFileSystem } from '../src/index.ts'

let dir: string
let ctx: Context
let fs: LocalFileSystem
let fiber: Awaited<ReturnType<Context['plugin']>>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-fs-transfer-'))
  ctx = new Context()
  fiber = await ctx.plugin(LocalFileSystem, { cwd: dir })
  fs = ctx.fs as LocalFileSystem
})
afterEach(async () => {
  await fiber.dispose()
  await rm(dir, { recursive: true, force: true })
})

/** Write one binary fixture and resolve it. */
async function binary(name: string, bytes: readonly number[]): Promise<FsTarget> {
  await writeFile(join(dir, name), Buffer.from(bytes))
  return fs.resolve(name)
}

/** The bytes on disk for one relative path. */
async function bytes(name: string): Promise<Buffer> {
  return readFile(join(dir, name))
}

/** The version the backend currently reports for a resolved target. */
async function versionOf(target: FsTarget): Promise<FsVersion> {
  const info = await fs.stat(target)
  if (!info) throw new Error('expected target to exist')
  return info.version
}

describe('copy', () => {
  it('copies binary content byte for byte without touching the source', async () => {
    const source = await binary('source.bin', [0, 255, 1, 2, 128, 10])
    const destination = await fs.resolve('nested/destination.bin')
    const outcome = await fs.transferFile(source, destination, {
      move: false,
      expectedSource: { version: await versionOf(source) },
      expectedDestination: { kind: 'createIfAbsent' },
    })
    expect(outcome).toMatchObject({ operation: 'create', size: 6 })
    expect(await bytes('nested/destination.bin')).toEqual(await bytes('source.bin'))
    expect(await bytes('source.bin')).toEqual(Buffer.from([0, 255, 1, 2, 128, 10]))
  })

  it('refuses an existing destination under createIfAbsent and keeps it intact', async () => {
    const source = await binary('source.bin', [1])
    await writeFile(join(dir, 'existing.bin'), Buffer.from([9]))
    await expect(fs.transferFile(source, await fs.resolve('existing.bin'), {
      move: false, expectedDestination: { kind: 'createIfAbsent' },
    })).rejects.toMatchObject({ code: 'FS_ALREADY_EXISTS' })
    expect(await bytes('existing.bin')).toEqual(Buffer.from([9]))
  })

  it('replaces only the version the caller observed', async () => {
    const source = await binary('source.bin', [1, 2])
    await writeFile(join(dir, 'destination.bin'), Buffer.from([9]))
    const destination = await fs.resolve('destination.bin')
    await expect(fs.transferFile(source, destination, {
      move: false, expectedDestination: { kind: 'replaceIfVersion', version: brandString<FsVersion>('stale') },
    })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })

    const outcome = await fs.transferFile(source, destination, {
      move: false, expectedDestination: { kind: 'replaceIfVersion', version: await versionOf(destination) },
    })
    expect(outcome.operation).toBe('update')
    expect(await bytes('destination.bin')).toEqual(Buffer.from([1, 2]))
  })

  it('rejects identical targets, missing sources, and destinations that are directories', async () => {
    const source = await binary('source.bin', [1])
    await expect(fs.transferFile(source, source, { move: false })).rejects.toMatchObject({ code: 'FS_SAME_TARGET' })
    await expect(fs.transferFile(source, source, { move: true })).rejects.toThrow('cannot move')
    await expect(fs.transferFile(source, source, { move: false })).rejects.toThrow('cannot copy')
    await expect(fs.transferFile(await fs.resolve('missing.bin'), await fs.resolve('new.bin'), { move: false }))
      .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
    await mkdir(join(dir, 'folder'))
    await expect(fs.transferFile(source, await fs.resolve('folder'), { move: false }))
      .rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
  })

  it('honours an abort raised before the commit checkpoint', async () => {
    const source = await binary('source.bin', [1])
    const controller = new AbortController()
    controller.abort()
    await expect(fs.transferFile(source, await fs.resolve('copy.bin'), {
      move: true, expectedDestination: { kind: 'createIfAbsent' },
    }, controller.signal)).rejects.toMatchObject({ code: 'FS_ABORTED' })
  })

  it('honours an abort before publication', async () => {
    const source = await binary('source.bin', [1])
    const controller = new AbortController()
    fs.internals.inspectTemp = () => { controller.abort() }
    await expect(fs.transferFile(source, await fs.resolve('copy.bin'), {
      move: false, expectedDestination: { kind: 'createIfAbsent' },
    }, controller.signal)).rejects.toMatchObject({ code: 'FS_ABORTED' })
    await expect(stat(join(dir, 'copy.bin'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('move', () => {
  it('moves binary content and removes the source', async () => {
    const source = await binary('source.bin', [7, 8, 9])
    const outcome = await fs.transferFile(source, await fs.resolve('moved.bin'), {
      move: true, expectedDestination: { kind: 'createIfAbsent' },
    })
    expect(outcome).toMatchObject({ operation: 'create', size: 3, sourceDeleted: true })
    expect(await bytes('moved.bin')).toEqual(Buffer.from([7, 8, 9]))
    await expect(stat(join(dir, 'source.bin'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('creates missing destination parents for a move', async () => {
    const source = await binary('source.bin', [4])
    const outcome = await fs.transferFile(source, await fs.resolve('nested/deep/moved.bin'), {
      move: true, expectedDestination: { kind: 'createIfAbsent' },
    })
    expect(outcome.sourceDeleted).toBe(true)
    expect(await bytes('nested/deep/moved.bin')).toEqual(Buffer.from([4]))
  })

  it('reports a destination whose parent cannot be created', async () => {
    const source = await binary('source.bin', [4])
    const locked = join(dir, 'locked')
    await mkdir(locked)
    await chmod(locked, 0o500)
    try {
      await expect(fs.transferFile(source, await fs.resolve('locked/moved.bin'), {
        move: true, expectedDestination: { kind: 'createIfAbsent' },
      })).rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
    } finally {
      await chmod(locked, 0o700)
    }
    expect(await bytes('source.bin')).toEqual(Buffer.from([4]))
  })

  it('falls back to a byte copy when the volume cannot hard-link', async () => {
    const source = await binary('source.bin', [4, 5])
    fs.internals.linkFile = async () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }) }
    const outcome = await fs.transferFile(source, await fs.resolve('moved.bin'), {
      move: true, expectedDestination: { kind: 'createIfAbsent' },
    })
    expect(outcome.sourceDeleted).toBe(true)
    expect(await bytes('moved.bin')).toEqual(Buffer.from([4, 5]))
  })

  it('requires the versioned destination to still exist', async () => {
    const source = await binary('source.bin', [3])
    await expect(fs.transferFile(source, await fs.resolve('absent.bin'), {
      move: false, expectedDestination: { kind: 'replaceIfVersion', version: brandString<FsVersion>('absent') },
    })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
  })

  it('reports a retained source when only the destination commit succeeds', async () => {
    const source = await binary('source.bin', [3])
    fs.internals.removeFile = async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) }
    const outcome = await fs.transferFile(source, await fs.resolve('moved.bin'), {
      move: true, expectedDestination: { kind: 'createIfAbsent' },
    })
    expect(outcome).toMatchObject({ sourceDeleted: false, sourceFailure: { code: 'FS_PERMISSION_DENIED' } })
    expect(await bytes('moved.bin')).toEqual(Buffer.from([3]))
    expect(await bytes('source.bin')).toEqual(Buffer.from([3]))
  })
})
