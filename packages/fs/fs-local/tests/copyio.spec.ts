/** Byte-copy publication mechanics: staging, no-replace fallbacks, Windows preservation, and guarded failures. */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { copyFileAtomic, tryLinkFile } from '../src/fsio.ts'

/** One scratch directory with a source file. */
async function setup(): Promise<{ root: string; source: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fs-copyio-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source.bin')
  await writeFile(source, Buffer.from([1, 2, 3]))
  return { root, source }
}

describe('copyFileAtomic', () => {
  it('copies with defaults, creates parents, and keeps the source mode', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'nested', 'copy.bin')
    await copyFileAtomic(source, destination, undefined, undefined)
    expect(await readFile(destination)).toEqual(Buffer.from([1, 2, 3]))
  })

  it('refuses an aborted call before staging', async () => {
    const { root, source } = await setup()
    const controller = new AbortController()
    controller.abort()
    await expect(copyFileAtomic(source, join(root, 'copy.bin'), undefined, controller.signal))
      .rejects.toMatchObject({ code: 'FS_ABORTED' })
  })

  it('reports a destination parent that cannot be created', async () => {
    const { root, source } = await setup()
    const blocker = join(root, 'blocker')
    await writeFile(blocker, 'x')
    await expect(copyFileAtomic(source, join(blocker, 'copy.bin'), undefined, undefined))
      .rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  })

  it('preserves a replaced Windows destination DACL and replaces through the native boundary', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await writeFile(destination, Buffer.from([9]))
    const dacl: string[] = []
    const replaced: string[] = []
    await copyFileAtomic(source, destination, 0o640, undefined, {
      platform: 'win32',
      copyFileDacl: async (from, to) => { dacl.push(`${from}->${to}`) },
      replaceFile: async (target, replacement) => {
        replaced.push(`${target}<-${replacement}`)
        await rename(replacement, target)
      },
    }, { createIfAbsent: false, existingDestination: true })
    expect(dacl).toHaveLength(1)
    expect(replaced).toHaveLength(1)
    expect(await readFile(destination)).toEqual(Buffer.from([1, 2, 3]))
  })

  it('falls back to a rename when the replaced Windows target disappeared', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await writeFile(destination, Buffer.from([9]))
    await copyFileAtomic(source, destination, undefined, undefined, {
      platform: 'win32',
      copyFileDacl: async () => {},
      replaceFile: async () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }) },
    }, { createIfAbsent: false, existingDestination: true })
    expect(await readFile(destination)).toEqual(Buffer.from([1, 2, 3]))
  })

  it('propagates a non-ENOENT Windows replacement failure', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await writeFile(destination, Buffer.from([9]))
    await expect(copyFileAtomic(source, destination, undefined, undefined, {
      platform: 'win32',
      copyFileDacl: async () => {},
      replaceFile: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) },
    }, { createIfAbsent: false, existingDestination: true })).rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
  })

  it('publishes through COPYFILE_EXCL when the volume cannot hard-link', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await copyFileAtomic(source, destination, undefined, undefined, {
      linkFile: async () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }) },
    }, { createIfAbsent: true })
    expect(await readFile(destination)).toEqual(Buffer.from([1, 2, 3]))
  })

  it('protects a destination that appeared during the EXCL fallback', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await writeFile(destination, Buffer.from([9]))
    await expect(copyFileAtomic(source, destination, undefined, undefined, {
      linkFile: async () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }) },
    }, { createIfAbsent: true })).rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' })
    expect(await readFile(destination)).toEqual(Buffer.from([9]))
  })

  it('reports a link collision from the target inspection', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await writeFile(destination, Buffer.from([9]))
    await expect(copyFileAtomic(source, destination, undefined, undefined, {
      linkFile: async () => { throw Object.assign(new Error('exists'), { code: 'EEXIST' }) },
    }, { createIfAbsent: true })).rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' })
  })

  it('maps an unsupported-link error with no target to an I/O failure', async () => {
    const { root, source } = await setup()
    await expect(copyFileAtomic(source, join(root, 'copy.bin'), undefined, undefined, {
      linkFile: async () => { throw new Error('boom') },
    }, { createIfAbsent: true })).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  })

  it('fails before publication when the staging directory cannot be created', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await writeFile(join(root, 'staging'), 'x')
    await expect(copyFileAtomic(source, destination, undefined, undefined, {
      tempDirName: () => 'staging',
    })).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  })

  it('keeps the commit when staging cleanup fails afterwards', async () => {
    const { root, source } = await setup()
    const destination = join(root, 'copy.bin')
    await copyFileAtomic(source, destination, undefined, undefined, {
      removeStagingDir: async () => { throw new Error('cleanup failed') },
    }, { createIfAbsent: true })
    expect(await readFile(destination)).toEqual(Buffer.from([1, 2, 3]))
  })

  it('reports a staging removal failure after an I/O failure', async () => {
    const { root, source } = await setup()
    await mkdir(join(root, 'blocker'))
    await writeFile(join(root, 'blocker', 'file'), 'x')
    const destination = join(root, 'blocker', 'file', 'copy.bin')
    await expect(copyFileAtomic(source, destination, undefined, undefined)).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  })
})

describe('tryLinkFile', () => {
  it('links a file and refuses an existing destination', async () => {
    const { root, source } = await setup()
    expect(await tryLinkFile(source, join(root, 'linked.bin'), 'linked.bin')).toBe(true)
    await writeFile(join(root, 'existing.bin'), 'x')
    await expect(tryLinkFile(source, join(root, 'existing.bin'), 'existing.bin'))
      .rejects.toMatchObject({ code: 'FS_ALREADY_EXISTS' })
  })

  it('returns false for unsupported-link volumes and maps other failures', async () => {
    const { root, source } = await setup()
    expect(await tryLinkFile(source, join(root, 'a.bin'), 'a.bin', {
      linkFile: async () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }) },
    })).toBe(false)
    await expect(tryLinkFile(source, join(root, 'b.bin'), 'b.bin', {
      linkFile: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) },
    })).rejects.toMatchObject({ code: 'FS_PERMISSION_DENIED' })
  })
})
