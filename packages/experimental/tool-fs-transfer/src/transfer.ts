/**
 * Model-facing byte-exact copy and move over `ctx.fs.transferFile`: no text
 * decode, no overwrite, and sandbox escalation identical to the other
 * mutating filesystem tools.
 * @module @deepseek-ai/dsh-tool-fs-transfer/transfer
 */

import type { Context } from '@deepseek-ai/cordis'
import { ToolArgsError, defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { FsTransferOutcome } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-working-directory'
import type { TransferEscalationArgs, TransferSandbox } from './sandbox.ts'

/** Result value shared by both tools. */
interface TransferValue {
  source: string
  destination: string
  operation: 'create' | 'update'
  size: number
  sourceDeleted?: boolean
  sourceFailure?: string
}

/** The paths both tools take, plus the optional escalation fields. */
type TransferArgs = {
  source_path: string
  destination_path: string
} & TransferEscalationArgs

const PATHS = {
  source_path: {
    type: 'string',
    required: true,
    description: 'Existing file to copy or move, resolved by the filesystem backend (relative paths use the Session directory).',
  },
  destination_path: {
    type: 'string',
    required: true,
    description: 'Destination file path. It must not exist; parent directories are created.',
  },
} as const

const OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    source: { type: 'string', required: true, description: 'Canonical source path in the filesystem execution world.' },
    destination: { type: 'string', required: true, description: 'Canonical destination path in the filesystem execution world.' },
    operation: { type: 'string', required: true, enum: ['create', 'update'] },
    size: { type: 'integer', required: true, description: 'Destination size in bytes.' },
    sourceDeleted: { type: 'boolean', description: 'For a move, whether the source was removed.' },
    sourceFailure: { type: 'string', description: 'For a move whose destination committed but source removal failed.' },
  },
} as const

/**
 * Validate the path fields the schema cannot express.
 * @param args - schema-validated arguments.
 * @returns the two paths with surrounding whitespace preserved for the backend.
 */
function parseArgs(args: TransferArgs): { source: string; destination: string } {
  if (args.source_path.trim().length === 0) throw new ToolArgsError(['source_path must be a non-empty string'])
  if (args.destination_path.trim().length === 0) throw new ToolArgsError(['destination_path must be a non-empty string'])
  return { source: args.source_path, destination: args.destination_path }
}

/**
 * Resolve the Session directory for relative paths.
 * @param ctx - context carrying the working-directory service.
 * @param exec - current tool execution.
 * @returns resolution options for the provider.
 */
async function resolveOptions(ctx: Context, exec: ToolExecution): Promise<{ cwd?: string; signal: AbortSignal }> {
  const cwd = exec.agent === undefined ? undefined : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  return { ...cwd === undefined ? {} : { cwd }, signal: exec.signal }
}

/**
 * Render the result as a compact envelope.
 * @param value - transfer result.
 * @returns one model-facing text block.
 */
function render(value: TransferValue): string {
  const verb = value.sourceDeleted === undefined ? 'Copied' : 'Moved'
  const warning = value.sourceFailure === undefined ? '' : `\nWarning: the destination was written but the source was retained (${value.sourceFailure}).`
  return `<path>${value.destination}</path>
<type>file</type>
<content>
${verb} ${String(value.size)} bytes from ${value.source}${warning}
</content>`
}

/**
 * Execute one transfer and shape the result.
 * @param ctx - tool context.
 * @param sandbox - policy resolver.
 * @param toolName - posting tool name.
 * @param move - whether to remove the source after publication.
 * @param args - raw tool arguments.
 * @param exec - execution context.
 * @returns the structured result.
 */
async function run(
  ctx: Context, sandbox: TransferSandbox, toolName: string, move: boolean, args: TransferArgs, exec: ToolExecution,
): Promise<TransferValue> {
  const { source, destination } = parseArgs(args)
  const policy = await sandbox.resolvePolicy(toolName, args, exec)
  const options = await resolveOptions(ctx, exec)
  const sourceTarget = await ctx.fs.resolve(source, options)
  const destinationTarget = await ctx.fs.resolve(destination, options)
  let outcome: FsTransferOutcome
  try {
    outcome = await ctx.fs.transferFile(
      sourceTarget,
      destinationTarget,
      { move, expectedDestination: { kind: 'createIfAbsent' } },
      exec.signal,
      policy,
    )
  } catch (error) {
    throw sandbox.mapError(error, policy)
  }
  return {
    source: ctx.fs.processPath(sourceTarget),
    destination: ctx.fs.processPath(destinationTarget),
    operation: outcome.operation,
    size: outcome.size,
    ...outcome.sourceDeleted === undefined ? {} : { sourceDeleted: outcome.sourceDeleted },
    ...outcome.sourceFailure === undefined ? {} : { sourceFailure: `${outcome.sourceFailure.code}: ${outcome.sourceFailure.message}` },
  }
}

/**
 * Register `fs_copy` and `fs_move`.
 * @param ctx - plugin context.
 * @param sandbox - shared escalation surface.
 */
export function applyTransferTools(ctx: Context, sandbox: TransferSandbox): void {
  const escalation = sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {}
  ctx.tools.register(defineTool({
    name: 'fs_copy',
    description: 'Copy one file byte for byte. The destination must not exist; parent directories are created. Use this for documents, images, and other binaries that read/write tools cannot decode.',
    parameters: { ...PATHS, ...escalation },
    output: {
      schema: OUTPUT,
      render: (_args, value) => [{ type: 'text', text: render(value) }],
    },
    async execute(args, exec) {
      return await run(ctx, sandbox, 'fs_copy', false, args, exec)
    },
  }))
  ctx.tools.register(defineTool({
    name: 'fs_move',
    description: 'Move one file byte for byte, removing the source after the destination is complete. The destination must not exist; parent directories are created. Use this for sorting and archiving binaries.',
    parameters: { ...PATHS, ...escalation },
    output: {
      schema: OUTPUT,
      render: (_args, value) => [{ type: 'text', text: render(value) }],
    },
    async execute(args, exec) {
      return await run(ctx, sandbox, 'fs_move', true, args, exec)
    },
  }))
}
