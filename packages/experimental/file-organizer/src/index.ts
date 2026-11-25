/**
 * Rule-driven folder organization: preview a plan, apply it with no-overwrite
 * moves, undo completed moves, and list durable batches. Files move through
 * `ctx.fs.transferFile`; plans live in the `fileOrganizer` storage domain.
 * @module @deepseek-ai/dsh-file-organizer
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from '@deepseek-ai/dsh-filetags'
import { FileOrganizer, type OrganizerConfig } from './service.ts'
import { registerOrganizerCard } from './card.ts'

export type { BatchResult, BatchSummary, FileOrganizer, MoveOutcome, OrganizerConfig, PreviewResult, TagWriter } from './service.ts'
export type { OrganizePlan, OrganizeRule, PlannedMove, PlannedSkip } from './rules.ts'
export { OrganizerError } from './error.ts'
export type { OrganizerErrorCode } from './error.ts'

/** Cordis plugin name. */
export const name = 'file-organizer'
/** Services required to resolve paths, move files, register tools, and persist batches. */
export const inject = ['tools', 'fs', 'workingDirectory', 'storageDomain']

/** Plugin configuration. */
export interface Config {
  /** Direct children considered by one preview. */
  maxFiles: number
  /** Moves and skips echoed in one tool result. */
  maxDisplayEntries: number
  /** Batches listed by history. */
  maxHistory: number
}

/** Schemastery validator for {@link Config}. */
export const Config: z<Config> = z.object({
  maxFiles: z.number().step(1).min(1).default(1000),
  maxDisplayEntries: z.number().step(1).min(1).default(100),
  maxHistory: z.number().step(1).min(1).default(50),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable folder organizer shared with other Host consumers. */
    fileOrganizer: FileOrganizer
  }
}

const MOVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    from: { type: 'string', required: true },
    to: { type: 'string', required: true },
    tags: { type: 'array', items: { type: 'string' } },
  },
} as const

const SKIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string', required: true },
    reason: { type: 'string', required: true },
  },
} as const

const OUTCOME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    from: { type: 'string', required: true },
    to: { type: 'string', required: true },
    status: { type: 'string', required: true, enum: ['done', 'failed', 'skipped', 'restored', 'reversed', 'undo-failed'] },
    reason: { type: 'string' },
  },
} as const

/**
 * Resolve relative paths from the Session directory.
 * @param ctx - context carrying the working-directory service.
 * @param exec - current tool execution.
 * @returns resolution options for the provider.
 */
async function resolveOptions(ctx: Context, exec: ToolExecution): Promise<{ cwd?: string; signal: AbortSignal }> {
  const cwd = exec.agent === undefined ? undefined : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  return { ...cwd === undefined ? {} : { cwd }, signal: exec.signal }
}

/** The snake_case result shape the preview tool declares. */
interface PreviewOutput {
  batch_id: string
  directory: string
  total_moves: number
  total_skipped: number
  moves: { from: string; to: string; tags?: readonly string[] }[]
  skipped: { path: string; reason: string }[]
}

/** The snake_case result shape the apply and undo tools declare. */
interface BatchOutput {
  batch_id: string
  status: 'applied' | 'partial' | 'undone' | 'undoPartial'
  done: number
  failed: number
  outcomes: { from: string; to: string; status: string; reason?: string }[]
}

/**
 * Render preview lines.
 * @param value - preview result.
 * @returns one text block.
 */
function renderPreview(value: PreviewOutput): string {
  const moves = value.moves.map(move => `${move.from} -> ${move.to}`).join('\n')
  return `batch ${value.batch_id}\ndirectory ${value.directory}\n${String(value.total_moves)} planned, ${String(value.total_skipped)} skipped\n${moves}`
}

/**
 * Render an apply or undo result.
 * @param value - batch result.
 * @returns one text block.
 */
function renderBatch(value: BatchOutput): string {
  const lines = value.outcomes.map(outcome => `${outcome.status}: ${outcome.from} -> ${outcome.to}${outcome.reason === undefined ? '' : ` (${outcome.reason})`}`)
  return `batch ${value.batch_id}\nstatus ${value.status}\ndone ${String(value.done)}, failed ${String(value.failed)}\n${lines.join('\n')}`
}

/**
 * Register the four organization tools and the durable service.
 * @param ctx - plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const limits = config as OrganizerConfig
  const organizer = new FileOrganizer(ctx, limits, () => ctx.get('fileTags'))
  ctx.provide('fileOrganizer', organizer)

  ctx.inject(['actionCards'], (cardsCtx) => { registerOrganizerCard(cardsCtx.actionCards, organizer) })

  ctx.tools.register(defineTool({
    name: 'organize_preview',
    description: 'Plan how direct files in one directory would move into category subdirectories. Rules are ordered: the first glob matching a file name wins, and others_target receives the rest. Nothing moves until organize_apply. '
      + 'After presenting the plan to a human, end your answer with one ```action-card block offering action "organize_files" and details {batchId, directory, totalMoves, totalSkipped} copied from the preview. '
      + 'For an unattended scheduled run, call organize_apply directly instead of offering a card.',
    parameters: {
      directory: { type: 'string', required: true, description: 'Directory whose direct files to organize (relative paths use the Session directory).' },
      rules: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pattern: { type: 'string', required: true, description: 'Glob matched against the file name, such as *.pdf.' },
            target: { type: 'string', required: true, description: 'Relative subdirectory below destination_root to move matches into, such as documents.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags attached to each moved file, when filetags is mounted.' },
          },
        },
        description: 'Ordered rules; the first matching rule wins.',
      },
      destination_root: { type: 'string', description: 'Directory the rule targets live under. Defaults to the organized directory; set it to move inbox files into another tree.' },
      others_target: { type: 'string', description: 'Relative subdirectory for files that match no rule. Omit to leave them in place.' },
      others_tags: { type: 'array', items: { type: 'string' }, description: 'Tags for files matching no rule.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          batch_id: { type: 'string', required: true },
          directory: { type: 'string', required: true },
          total_moves: { type: 'integer', required: true },
          total_skipped: { type: 'integer', required: true },
          moves: { type: 'array', required: true, items: MOVE_SCHEMA },
          skipped: { type: 'array', required: true, items: SKIP_SCHEMA },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderPreview(value) }],
    },
    async execute(args, exec) {
      if (args.directory.trim().length === 0) throw new ToolArgsError(['directory must be a non-empty string'])
      const options = await resolveOptions(ctx, exec)
      const target = await ctx.fs.resolve(args.directory, options)
      const destinationRoot = args.destination_root === undefined
        ? undefined
        : ctx.fs.processPath(await ctx.fs.resolve(args.destination_root, options))
      const result = await organizer.preview({
        directory: ctx.fs.processPath(target),
        rules: args.rules,
        ...destinationRoot === undefined ? {} : { destinationRoot },
        ...args.others_target === undefined ? {} : { othersTarget: args.others_target },
        ...args.others_tags === undefined ? {} : { othersTags: args.others_tags },
      }, exec.signal)
      return {
        batch_id: result.batchId,
        directory: result.directory,
        total_moves: result.totalMoves,
        total_skipped: result.totalSkipped,
        moves: result.moves.map(move => ({ from: move.from, to: move.to, ...move.tags === undefined ? {} : { tags: [...move.tags] } })),
        skipped: result.skipped.map(skip => ({ path: skip.path, reason: skip.reason })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'organize_apply',
    description: 'Execute a planned organization batch. Every move is re-checked; existing destinations are never overwritten. Requires confirm: true after the user has seen the preview.',
    parameters: {
      batch_id: { type: 'string', required: true, description: 'Batch id returned by organize_preview.' },
      confirm: { type: 'boolean', required: true, description: 'Must be true; confirms the user approved the previewed moves.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          batch_id: { type: 'string', required: true },
          status: { type: 'string', required: true, enum: ['applied', 'partial'] },
          done: { type: 'integer', required: true },
          failed: { type: 'integer', required: true },
          outcomes: { type: 'array', required: true, items: OUTCOME_SCHEMA },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderBatch(value) }],
    },
    async execute(args, exec) {
      if (args.confirm !== true) throw new ToolArgsError(['confirm must be true after the user approves the preview'])
      const result = await organizer.apply(args.batch_id, exec.signal)
      const status: BatchOutput['status'] = result.status === 'partial' ? 'partial' : 'applied'
      return {
        batch_id: result.batchId,
        status,
        done: result.done,
        failed: result.failed,
        outcomes: result.outcomes.map(outcome => ({ ...outcome })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'organize_undo',
    description: 'Reverse the completed moves of an applied organization batch. A file whose original path is occupied is left in place and reported.',
    parameters: {
      batch_id: { type: 'string', required: true, description: 'Applied batch id to reverse.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          batch_id: { type: 'string', required: true },
          status: { type: 'string', required: true, enum: ['undone', 'undoPartial'] },
          done: { type: 'integer', required: true },
          failed: { type: 'integer', required: true },
          outcomes: { type: 'array', required: true, items: OUTCOME_SCHEMA },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderBatch(value) }],
    },
    async execute(args, exec) {
      const result = await organizer.undo(args.batch_id, exec.signal)
      const status: BatchOutput['status'] = result.status === 'undoPartial' ? 'undoPartial' : 'undone'
      return {
        batch_id: result.batchId,
        status,
        done: result.done,
        failed: result.failed,
        outcomes: result.outcomes.map(outcome => ({ ...outcome })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'organize_history',
    description: 'List recent organization batches with their directories, statuses, and move counts.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          batches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                batch_id: { type: 'string', required: true },
                directory: { type: 'string', required: true },
                status: { type: 'string', required: true },
                created_at: { type: 'string', required: true },
                moves: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.batches.map(batch => `${batch.batch_id} ${batch.status} ${batch.directory} (${String(batch.moves)} moves)`).join('\n'),
      }],
    },
    async execute() {
      const batches = await organizer.history()
      return {
        batches: batches.map(batch => ({
          batch_id: batch.batchId,
          directory: batch.directory,
          status: batch.status,
          created_at: batch.createdAt,
          moves: batch.moves,
        })),
      }
    },
  }))
}
