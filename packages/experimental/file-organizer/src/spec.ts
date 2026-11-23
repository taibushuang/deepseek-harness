/**
 * Durable organize domain: one record per preview batch, carrying its moves and
 * terminal status so apply, undo, and history survive a Host restart.
 * @module @deepseek-ai/dsh-file-organizer/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

/** One planned move and its latest outcome. */
export const organizeMove = z.object({
  /** Absolute source path. */
  from: z.string(),
  /** Absolute destination path. */
  to: z.string(),
  /** Latest outcome for this move. */
  status: z.enum(['pending', 'done', 'failed', 'skipped']),
  /** Tags to attach after the move. */
  tags: z.array(z.string()).optional(),
  /** Whether tagging succeeded after the move. */
  tagged: z.boolean().optional(),
  /** Failure or skip reason, when not done; also a tagging failure after a done move. */
  reason: z.string().optional(),
  /** Whether an undo restored this move. */
  reversed: z.boolean().optional(),
})

/** One path the preview left alone. */
export const organizeSkip = z.object({
  /** Absolute path. */
  path: z.string(),
  /** Why the file is not planned. */
  reason: z.string(),
})

/** Durable state of one preview/apply/undo batch. */
export const organizeBatch = z.object({
  /** Batch identity handed back to the model. */
  id: z.string(),
  /** Absolute organized directory. */
  directory: z.string(),
  /** ISO creation time. */
  createdAt: z.string(),
  /** ISO last-write time. */
  updatedAt: z.string(),
  /** Batch lifecycle. */
  status: z.enum(['planned', 'applied', 'partial', 'undone', 'undoPartial']),
  /** Planned moves with their latest outcomes. */
  moves: z.array(organizeMove),
  /** Paths the preview skipped. */
  skipped: z.array(organizeSkip),
})

/** One stored batch. */
export type OrganizeBatchRecord = z.infer<typeof organizeBatch>

/** The organizer domain; records live in one `batches` table keyed by batch id. */
export const organizerDomainSpec = defineDomain({
  name: 'file_organizer',
  version: 1,
  tables: { batches: domainTable<string, OrganizeBatchRecord>(organizeBatch) },
})
