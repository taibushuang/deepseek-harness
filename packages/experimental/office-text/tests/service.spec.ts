/** The extraction service over the filesystem seam: guards, caps, and delegation. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OfficeTextService } from '../src/service.ts'
import type { OfficeTextLimits } from '../src/service.ts'
import { docx, paragraph } from './fixtures.ts'

const LIMITS: OfficeTextLimits = {
  maxBytes: 1024 * 1024,
  maxChars: 20_000,
  maxCharsCap: 100_000,
  maxPages: 50,
  maxPagesCap: 200,
}

let dir: string
let ctx: Context
let fiber: Awaited<ReturnType<Context['plugin']>>
let service: OfficeTextService

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-office-text-'))
  ctx = new Context()
  fiber = await ctx.plugin(LocalFileSystem, { cwd: dir })
  service = new OfficeTextService(ctx.fs, LIMITS)
})
afterEach(async () => {
  await fiber.dispose()
  await ctx.fiber.dispose()
  await rm(dir, { recursive: true, force: true })
})

/** Write one fixture and resolve it. */
async function file(name: string, bytes: Uint8Array) {
  return { path: join(dir, name), target: await (async () => {
    await writeFile(join(dir, name), bytes)
    return ctx.fs.resolve(name)
  })() }
}

describe('OfficeTextService', () => {
  it('reads a supported document and applies the call caps', async () => {
    const { target } = await file('a.docx', docx(paragraph('abcdef')))
    expect(await service.extract(target)).toMatchObject({ format: 'docx', text: 'abcdef', truncated: false })
    expect(await service.extract(target, { maxChars: 3 })).toMatchObject({ text: 'abc', truncated: true })
    expect(await service.extract(target, { maxChars: 10_000_000 })).toMatchObject({ truncated: false })
    expect(await service.extract(target, { maxPages: -1 })).toMatchObject({ truncated: false })
  })

  it('rejects a missing file, a directory, and an unsupported extension', async () => {
    await expect(service.extract(await ctx.fs.resolve('missing.docx'))).rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
    await mkdir(join(dir, 'folder.docx'))
    await expect(service.extract(await ctx.fs.resolve('folder.docx'))).rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
    await writeFile(join(dir, 'a.doc'), 'legacy')
    await expect(service.extract(await ctx.fs.resolve('a.doc'))).rejects.toMatchObject({ code: 'OFFICE_TEXT_UNSUPPORTED' })
  })

  it('rejects a document above the configured byte cap', async () => {
    const small = new OfficeTextService(ctx.fs, { ...LIMITS, maxBytes: 8 })
    const { target } = await file('big.docx', docx(paragraph('longer than eight bytes')))
    await expect(small.extract(target)).rejects.toMatchObject({ code: 'FS_TOO_LARGE' })
  })
})
