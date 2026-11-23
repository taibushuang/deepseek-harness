/**
 * Extraction service over the filesystem seam. It owns format detection, the
 * byte cap, and error mapping; the tool layer owns schemas and rendering.
 * @module @deepseek-ai/dsh-office-text/service
 */

import { extname } from 'node:path'
import { FsError, type FileSystem, type FsTarget } from '@deepseek-ai/dsh-fs'
import { OfficeTextError } from './error.ts'
import { extractOfficeText, formatOf } from './extract.ts'
import type { OfficeTextResult } from './types.ts'

/** Deployment limits shared by the service and the tool. */
export interface OfficeTextLimits {
  /** Maximum bytes read from one file. */
  readonly maxBytes: number
  /** Default retained characters when a call omits `max_chars`. */
  readonly maxChars: number
  /** Hard character ceiling for one call. */
  readonly maxCharsCap: number
  /** Default pages or slides read when a call omits `max_pages`. */
  readonly maxPages: number
  /** Hard page or slide ceiling for one call. */
  readonly maxPagesCap: number
}

/** One extraction request from a consumer. */
export interface OfficeTextRequest {
  /** Characters to retain; clamped to the configured ceiling. */
  readonly maxChars?: number
  /** Pages or slides to read; clamped to the configured ceiling. */
  readonly maxPages?: number
}

/** Plain-text extraction over `ctx.fs`. */
export class OfficeTextService {
  /**
   * @param fs - filesystem provider used to stat and read the document.
   * @param limits - deployment caps.
   */
  constructor(private readonly fs: FileSystem, private readonly limits: OfficeTextLimits) {}

  /**
   * Read one document as plain text.
   * @param target - resolved file in the filesystem execution world.
   * @param request - optional per-call caps.
   * @param signal - caller cancellation.
   * @returns the extracted result.
   * @throws {FsError} when the target is missing, not a regular file, or exceeds the byte cap.
   * @throws {OfficeTextError} for an unsupported or invalid document.
   */
  async extract(target: FsTarget, request: OfficeTextRequest = {}, signal?: AbortSignal): Promise<OfficeTextResult> {
    const info = await this.fs.stat(target, signal)
    if (info === undefined) throw new FsError(`cannot read "${target.displayPath}": file not found`, 'FS_NOT_FOUND')
    if (info.type !== 'file') throw new FsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
    const format = formatOf(extname(this.fs.processPath(target)))
    if (format === undefined) {
      throw new OfficeTextError(
        `unsupported document format for "${target.displayPath}": use .docx, .docm, .pptx, .pptm, .xlsx, .xlsm, or .pdf`,
        'OFFICE_TEXT_UNSUPPORTED',
      )
    }
    const maxChars = Math.min(Math.max(request.maxChars ?? this.limits.maxChars, 1), this.limits.maxCharsCap)
    const maxPages = Math.min(Math.max(request.maxPages ?? this.limits.maxPages, 1), this.limits.maxPagesCap)
    const bytes = await this.fs.readBytes(target, signal, this.limits.maxBytes)
    signal?.throwIfAborted()
    return await extractOfficeText({ bytes, format, maxChars, maxPages })
  }
}
