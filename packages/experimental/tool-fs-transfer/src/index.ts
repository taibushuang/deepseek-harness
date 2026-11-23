/**
 * Byte-exact file copy and move tools for file governance: sorting inboxes,
 * archiving Office documents, and placing generated outputs.
 * @module @deepseek-ai/dsh-tool-fs-transfer
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-user-approval'
import { TransferSandbox } from './sandbox.ts'
import { applyTransferTools } from './transfer.ts'

/** Cordis plugin name. */
export const name = 'tool-fs-transfer'
/** Services required to resolve paths, register tools, and escalate sandbox access. */
export const inject = ['tools', 'fs', 'workingDirectory']

/**
 * Register the transfer tools.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  applyTransferTools(ctx, new TransferSandbox(ctx.fs.sandboxMode, ctx.get('sandboxPolicy'), ctx.get('approval')))
}
