/**
 * Organizer service: plan one directory from rules, apply the plan with
 * no-overwrite moves, undo completed moves, and list durable batches. File
 * effects go through `ctx.fs.transferFile`; plans and outcomes live in the
 * `fileOrganizer` storage domain.
 * @module @deepseek-ai/dsh-file-organizer/service
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { FsError, type FsTarget } from '@deepseek-ai/dsh-fs'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { OrganizerError } from './error.ts'
import { compileRules, normalizeTarget, planMoves, type OrganizeRule, type PlannedMove, type PlannedSkip } from './rules.ts'
import { organizerDomainSpec, type OrganizeBatchRecord } from './spec.ts'

/** The tag-writing capability the organizer uses after a successful move. */
export interface TagWriter {
  tag(request: { readonly paths: readonly string[]; readonly tags: readonly string[] }, signal: AbortSignal): Promise<number>
}

/** Deployment limits for one organizer instance. */
export interface OrganizerConfig {
  /** Direct children considered by one preview. */
  readonly maxFiles: number
  /** Moves and skips echoed in one tool result. */
  readonly maxDisplayEntries: number
  /** Batches listed by history. */
  readonly maxHistory: number
}

/** One preview request from the tool layer. */
export interface PreviewRequest {
  /** Directory to organize. */
  readonly directory: string
  /** Ordered basename-glob rules. */
  readonly rules: readonly OrganizeRule[]
  /** Root the rule targets live under; defaults to the organized directory. */
  readonly destinationRoot?: string
  /** Optional target for files matching no rule. */
  readonly othersTarget?: string
  /** Tags for files matching no rule. */
  readonly othersTags?: readonly string[]
}

/** Preview result handed to the model. */
export interface PreviewResult {
  readonly batchId: string
  readonly directory: string
  readonly moves: readonly PlannedMove[]
  readonly skipped: readonly PlannedSkip[]
  readonly totalMoves: number
  readonly totalSkipped: number
}

/** One move outcome reported by apply or undo. */
export interface MoveOutcome {
  readonly from: string
  readonly to: string
  readonly status: 'done' | 'failed' | 'skipped' | 'restored' | 'reversed' | 'undo-failed'
  readonly reason?: string
}

/** Apply or undo result handed to the model. */
export interface BatchResult {
  readonly batchId: string
  readonly status: OrganizeBatchRecord['status']
  readonly outcomes: readonly MoveOutcome[]
  readonly done: number
  readonly failed: number
}

/** One durable batch summary. */
export interface BatchSummary {
  readonly batchId: string
  readonly directory: string
  readonly status: OrganizeBatchRecord['status']
  readonly createdAt: string
  readonly moves: number
}

/** Rule-driven folder organizer over one storage domain. */
export class FileOrganizer {
  private opened: Promise<KvTable<string, OrganizeBatchRecord>> | undefined
  private readonly active = new Set<string>()

  /**
   * @param ctx - Host context carrying the filesystem and storage domain.
   * @param config - deployment limits.
   * @param tagger - optional resolver for the tag writer used after a successful move.
   */
  constructor(
    private readonly ctx: Context,
    private readonly config: OrganizerConfig,
    private readonly tagger?: () => TagWriter | undefined,
  ) {}

  /**
   * Plan one directory without touching any file.
   * @param request - directory and rules.
   * @param signal - caller cancellation.
   * @returns the stored batch summary.
   */
  async preview(request: PreviewRequest, signal?: AbortSignal): Promise<PreviewResult> {
    if (request.rules.length === 0 && request.othersTarget === undefined) {
      throw new OrganizerError('provide at least one rule or an othersTarget', 'ORGANIZER_INVALID_RULE')
    }
    const directory = await this.directoryOf(request.directory, signal)
    const destinationRoot = request.destinationRoot === undefined
      ? directory
      : await this.directoryOf(request.destinationRoot, signal)
    const rules = compileRules(request.rules)
    const othersTarget = request.othersTarget === undefined ? undefined : normalizeTarget(request.othersTarget)
    const entries = await this.ctx.fs.listDir(directory, signal)
    const considered = entries.slice(0, this.config.maxFiles)
    const limited: PlannedSkip[] = entries.slice(this.config.maxFiles)
      .filter(entry => entry.type === 'file')
      .map(entry => ({ path: entry.target.displayPath, reason: 'limit' }))
    const plan = planMoves(
      this.ctx.fs.processPath(destinationRoot),
      considered,
      rules,
      othersTarget,
      request.othersTags,
    )
    const moves: PlannedMove[] = []
    const skipped: PlannedSkip[] = [...plan.skipped, ...limited]
    for (const move of plan.moves) {
      const destination = await this.ctx.fs.resolve(move.to, signal === undefined ? {} : { signal })
      if (await this.ctx.fs.stat(destination, signal) !== undefined) {
        skipped.push({ path: move.to, reason: 'exists' })
        continue
      }
      moves.push(move)
    }
    const now = new Date().toISOString()
    const record: OrganizeBatchRecord = {
      id: randomUUID(),
      directory: this.ctx.fs.processPath(directory),
      createdAt: now,
      updatedAt: now,
      status: 'planned',
      moves: moves.map(move => ({
        from: move.from,
        to: move.to,
        status: 'pending',
        ...move.tags === undefined ? {} : { tags: [...move.tags] },
      })),
      skipped,
    }
    await (await this.table()).put(record.id, record)
    return this.previewResult(record)
  }

  /**
   * Execute one planned batch.
   * @param batchId - batch to apply.
   * @param signal - caller cancellation checked between moves.
   * @returns the terminal status and per-move outcomes.
   */
  async apply(batchId: string, signal?: AbortSignal): Promise<BatchResult> {
    const record = await this.load(batchId)
    if (record.status !== 'planned') {
      throw new OrganizerError(`batch ${batchId} is ${record.status}; only a planned batch can be applied`, 'ORGANIZER_BATCH_STATE')
    }
    return await this.run(batchId, record, signal, false)
  }

  /**
   * Reverse every move an applied batch completed.
   * @param batchId - batch to undo.
   * @param signal - caller cancellation checked between moves.
   * @returns the terminal status and per-move outcomes.
   */
  async undo(batchId: string, signal?: AbortSignal): Promise<BatchResult> {
    const record = await this.load(batchId)
    if (record.status !== 'applied' && record.status !== 'partial') {
      throw new OrganizerError(`batch ${batchId} is ${record.status}; only an applied batch can be undone`, 'ORGANIZER_BATCH_STATE')
    }
    return await this.run(batchId, record, signal, true)
  }

  /**
   * List recent batches, newest first.
   * @returns batch summaries capped by configuration.
   */
  async history(): Promise<readonly BatchSummary[]> {
    const records = [...(await this.table()).entries()].map(([, record]) => record)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, this.config.maxHistory)
    return records.map(record => ({
      batchId: record.id,
      directory: record.directory,
      status: record.status,
      createdAt: record.createdAt,
      moves: record.moves.length,
    }))
  }

  private async run(batchId: string, record: OrganizeBatchRecord, signal: AbortSignal | undefined, undo: boolean): Promise<BatchResult> {
    if (this.active.has(batchId)) {
      throw new OrganizerError(`batch ${batchId} is already running`, 'ORGANIZER_BUSY')
    }
    this.active.add(batchId)
    try {
      const outcomes: MoveOutcome[] = []
      for (const move of record.moves) {
        signal?.throwIfAborted()
        const outcome = undo ? await this.undoMove(move, signal) : await this.applyMove(move, signal)
        outcomes.push(outcome)
        await this.persist(record)
      }
      const failed = outcomes.filter(outcome => outcome.status === 'failed' || outcome.status === 'undo-failed').length
      record.status = undo
        ? failed === 0 ? 'undone' : 'undoPartial'
        : failed === 0 ? 'applied' : 'partial'
      record.updatedAt = new Date().toISOString()
      await this.persist(record)
      return {
        batchId,
        status: record.status,
        outcomes: outcomes.slice(0, this.config.maxDisplayEntries),
        done: outcomes.filter(outcome => outcome.status === 'done' || outcome.status === 'restored' || outcome.status === 'reversed').length,
        failed,
      }
    } finally {
      this.active.delete(batchId)
    }
  }

  private async applyMove(move: OrganizeBatchRecord['moves'][number], signal: AbortSignal | undefined): Promise<MoveOutcome> {
    /* v8 ignore next -- a planned batch only stores pending moves; later statuses belong to applied batches. */
    if (move.status !== 'pending') return { ...move, status: 'skipped', reason: 'already-settled' }
    const source = await this.ctx.fs.resolve(move.from, signal === undefined ? {} : { signal })
    const destination = await this.ctx.fs.resolve(move.to, signal === undefined ? {} : { signal })
    const info = await this.ctx.fs.stat(source, signal)
    if (info === undefined) {
      move.status = 'skipped'
      move.reason = 'missing'
      return { ...move, status: 'skipped', reason: 'missing' }
    }
    if (info.type !== 'file') {
      move.status = 'failed'
      move.reason = 'not-a-file'
      return { ...move, status: 'failed', reason: 'not-a-file' }
    }
    if (await this.ctx.fs.stat(destination, signal) !== undefined) {
      move.status = 'failed'
      move.reason = 'exists'
      return { ...move, status: 'failed', reason: 'exists' }
    }
    try {
      await this.ctx.fs.transferFile(source, destination, { move: true, expectedDestination: { kind: 'createIfAbsent' } }, signal)
      move.status = 'done'
      delete move.reason
      if (move.tags !== undefined && move.tags.length > 0) {
        const tagger = this.tagger?.()
        if (tagger === undefined) {
          move.reason = 'tagging unavailable: no tag writer is mounted'
        } else {
          try {
            await tagger.tag({ paths: [move.to], tags: move.tags }, signal ?? new AbortController().signal)
            move.tagged = true
          } catch (error) {
            move.tagged = false
            move.reason = `tagging failed: ${error instanceof FsError ? `${error.code}: ${error.message}` : String(error)}`
          }
        }
      }
      return { from: move.from, to: move.to, status: 'done', ...move.reason === undefined ? {} : { reason: move.reason } }
    } catch (error) {
      const reason = error instanceof FsError ? `${error.code}: ${error.message}` : String(error)
      move.status = 'failed'
      move.reason = reason
      return { ...move, status: 'failed', reason }
    }
  }

  private async undoMove(move: OrganizeBatchRecord['moves'][number], signal: AbortSignal | undefined): Promise<MoveOutcome> {
    if (move.status !== 'done' || move.reversed === true) {
      return { ...move, status: 'skipped', reason: 'not-applied' }
    }
    const destination = await this.ctx.fs.resolve(move.to, signal === undefined ? {} : { signal })
    const source = await this.ctx.fs.resolve(move.from, signal === undefined ? {} : { signal })
    if (await this.ctx.fs.stat(destination, signal) === undefined) {
      move.reason = 'undo: destination missing'
      return { ...move, status: 'undo-failed', reason: move.reason }
    }
    if (await this.ctx.fs.stat(source, signal) !== undefined) {
      move.reason = 'undo: original path occupied'
      return { ...move, status: 'undo-failed', reason: move.reason }
    }
    try {
      await this.ctx.fs.transferFile(destination, source, { move: true, expectedDestination: { kind: 'createIfAbsent' } }, signal)
      move.reversed = true
      delete move.reason
      return { from: move.from, to: move.to, status: 'restored' }
    } catch (error) {
      const reason = error instanceof FsError ? `${error.code}: ${error.message}` : String(error)
      move.reason = `undo: ${reason}`
      return { ...move, status: 'undo-failed', reason: move.reason }
    }
  }

  private async directoryOf(path: string, signal?: AbortSignal): Promise<FsTarget> {
    const target = await this.ctx.fs.resolve(path, signal === undefined ? {} : { signal })
    const info = await this.ctx.fs.stat(target, signal)
    if (info === undefined) throw new OrganizerError(`directory "${path}" does not exist`, 'ORGANIZER_INVALID_DIRECTORY')
    if (info.type !== 'directory') throw new OrganizerError(`"${path}" is not a directory`, 'ORGANIZER_INVALID_DIRECTORY')
    return target
  }

  private async load(batchId: string): Promise<OrganizeBatchRecord> {
    const record = (await this.table()).get(batchId)
    if (record === undefined) throw new OrganizerError(`batch ${batchId} was not found`, 'ORGANIZER_BATCH_NOT_FOUND')
    return record
  }

  private previewResult(record: OrganizeBatchRecord): PreviewResult {
    return {
      batchId: record.id,
      directory: record.directory,
      moves: record.moves
        .map(({ from, to, tags }) => ({ from, to, ...tags === undefined ? {} : { tags } }))
        .slice(0, this.config.maxDisplayEntries),
      skipped: record.skipped.slice(0, this.config.maxDisplayEntries),
      totalMoves: record.moves.length,
      totalSkipped: record.skipped.length,
    }
  }

  private async persist(record: OrganizeBatchRecord): Promise<void> {
    record.updatedAt = new Date().toISOString()
    await (await this.table()).put(record.id, record)
  }

  private table(): Promise<KvTable<string, OrganizeBatchRecord>> {
    this.opened ??= this.ctx.storageDomain.open(organizerDomainSpec).then((domain) => {
      this.ctx.effect(() => () => domain.close(), 'file-organizer: domain')
      return domain.table('batches')
    })
    return this.opened
  }
}
