/** Legacy TagSpaces import: parser units and the real tool over a local directory. */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import FileTags from '../src/index.ts'
import { bracketTags, parseTsi } from '../src/import.ts'

let root: string | undefined
let context: Context | undefined
afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('legacy parsing', () => {
  it('reads tsi tags with a BOM and rejects multi-word tags', () => {
    const entries = parseTsi('\uFEFF[{"path":"a.txt","tags":[{"title":"work"},{"title":"two words"}]},{"path":"b.txt","tags":[]}]')
    expect(entries).toEqual([{ relativePath: 'a.txt', tags: ['work'] }])
    expect(parseTsi('not json')).toEqual([])
  })

  it('reads bracket tags from a file name', () => {
    expect(bracketTags('report [项目-经营分析 状态-草稿].md')).toEqual(['项目-经营分析', '状态-草稿'])
    expect(bracketTags('plain.md')).toEqual([])
  })
})

async function boot(): Promise<Context> {
  root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-filetags-import-')))
  const ctx = new Context()
  context = ctx
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(WorkingDirectory, { defaultDirectory: root })
  await ctx.plugin(FileTags, { path: join(root, 'tags.db'), maxImportEntries: 100, maxImportDisplay: 10 })
  await ctx.fiber.await()
  return ctx
}

async function tool(
  ctx: Context, name: string, args: Record<string, unknown>,
): Promise<{ value?: Record<string, unknown>; error?: string }> {
  const result = await executeToolFixture(ctx, {
    name, callId: brandString<ToolCallId>(name), arguments: args, signal: new AbortController().signal,
  })
  if (result.isError) return { error: result.content.map(block => ('text' in block ? block.text : '')).join('') }
  return { value: result.value as Record<string, unknown> }
}

describe('filetags_import', () => {
  it('previews and imports tsi and bracket tags without writing the old directory', async () => {
    const ctx = await boot()
    const library = join(root!, 'library')
    await mkdir(join(library, '.ts'), { recursive: true })
    await writeFile(join(library, 'a.txt'), 'a')
    await writeFile(join(library, 'b [项目-经营分析 状态-草稿].md'), 'b')
    await writeFile(join(library, '.ts', 'tsi.json'), '\uFEFF[{"path":"a.txt","tags":[{"title":"work"}]}]')
    const before = await tool(ctx, 'filetags_list', { path: join(library, 'a.txt') })
    expect(before.value).toEqual({ tags: [] })

    const preview = await tool(ctx, 'filetags_import', { directory: 'library', confirm: false })
    expect(preview.value).toMatchObject({ files: 2, tags: ['work', '状态-草稿', '项目-经营分析'].sort(), imported: 0 })
    const applied = await tool(ctx, 'filetags_import', { directory: 'library', confirm: true })
    expect(applied.value).toMatchObject({ imported: 2, failed: 0 })
    const tagged = await tool(ctx, 'filetags_search', { expression: 'work' })
    expect(tagged.value?.entries).toEqual([expect.objectContaining({ path: join(library, 'a.txt') })])
    const bracket = await tool(ctx, 'filetags_search', { expression: '项目-经营分析' })
    expect(bracket.value?.entries).toEqual([expect.objectContaining({ path: join(library, 'b [项目-经营分析 状态-草稿].md') })])
    expect((await tool(ctx, 'filetags_import', { directory: 'library', confirm: false })).value)
      .toMatchObject({ files: 2, imported: 0 })
  })
})
