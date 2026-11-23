/** The transfer tools through a real Loader composition: registration, execution, and disposal. */
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as ToolTransfer from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot the transfer tools through a real cordis.yml.
 * @returns the context and the temporary root.
 */
async function boot(): Promise<{ ctx: Context; base: string }> {
  root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-transfer-loader-')))
  const base = root
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-executor-native', NativeToolExecutor],
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
    ['@deepseek-ai/dsh-working-directory', WorkingDirectory],
    ['@deepseek-ai/dsh-tool-fs-transfer', ToolTransfer],
  ])
  const config = [...modules.keys()].flatMap(name => [
    `- name: 'cordis:${name}'`,
    ...name === '@deepseek-ai/dsh-fs-local' ? ['  config:', `    cwd: '${base}'`] : [],
    ...name === '@deepseek-ai/dsh-working-directory' ? ['  config:', `    defaultDirectory: '${base}'`] : [],
  ]).join('\n') + '\n'
  const configPath = join(base, 'cordis.yml')
  await writeFile(configPath, config)

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(base).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  for (const [specifier, plugin] of modules) ctx.loader.builtins[specifier] = plugin
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return { ctx, base }
}

describe('tool-fs-transfer real Loader composition', () => {
  it('registers both tools, transfers bytes, and withdraws them with the plugin', async () => {
    const { ctx, base } = await boot()
    expect(ctx.tools.schemas().map(tool => tool.name).sort()).toEqual(['fs_copy', 'fs_move'])

    await writeFile(join(base, 'source.bin'), Buffer.from([0, 255, 9]))
    const copy = await executeToolFixture(ctx, {
      name: 'fs_copy', callId: brandString<ToolCallId>('copy'),
      arguments: { source_path: 'source.bin', destination_path: 'nested/copy.bin' },
      signal: new AbortController().signal,
    })
    expect(copy.isError).toBe(false)
    expect(await readFile(join(base, 'nested', 'copy.bin'))).toEqual(Buffer.from([0, 255, 9]))

    const move = await executeToolFixture(ctx, {
      name: 'fs_move', callId: brandString<ToolCallId>('move'),
      arguments: { source_path: 'nested/copy.bin', destination_path: 'moved.bin' },
      signal: new AbortController().signal,
    })
    expect(move.isError).toBe(false)
    expect(await readFile(join(base, 'moved.bin'))).toEqual(Buffer.from([0, 255, 9]))

    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === 'cordis:@deepseek-ai/dsh-tool-fs-transfer')
    await entry!.fiber!.dispose()
    expect(ctx.tools.schemas().some(tool => tool.name.startsWith('fs_'))).toBe(false)
  }, 30_000)
})
