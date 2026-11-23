/**
 * Plain-text reading of Word, PowerPoint, Excel, and PDF documents, plus the
 * `office_text` model tool. The service is the reusable capability; the tool
 * adds path resolution, caps, and rendering.
 * @module @deepseek-ai/dsh-office-text
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import { OfficeTextService, type OfficeTextLimits } from './service.ts'
import type { OfficeTextFormat } from './types.ts'

export type * from './types.ts'
export { OfficeTextError } from './error.ts'
export type { OfficeTextErrorCode } from './error.ts'
export type { OfficeTextService } from './service.ts'
export type { OfficeTextLimits, OfficeTextRequest } from './service.ts'

/** Cordis plugin name. */
export const name = 'office-text'
/** Services required to resolve paths, register the tool, and read bytes. */
export const inject = ['tools', 'fs', 'workingDirectory']

/** Plugin configuration. */
export interface Config {
  /** Maximum bytes read from one document. */
  maxBytes: number
  /** Default retained characters. */
  maxChars: number
  /** Hard retained-character ceiling. */
  maxCharsCap: number
  /** Default pages or slides read. */
  maxPages: number
  /** Hard pages-or-slides ceiling. */
  maxPagesCap: number
}

/** Schemastery validator for {@link Config}. */
export const Config: z<Config> = z.object({
  maxBytes: z.number().step(1).min(1).default(64 * 1024 * 1024),
  maxChars: z.number().step(1).min(1).max(1_000_000).default(20_000),
  maxCharsCap: z.number().step(1).min(1).max(1_000_000).default(100_000),
  maxPages: z.number().step(1).min(1).max(10_000).default(50),
  maxPagesCap: z.number().step(1).min(1).max(10_000).default(200),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Plain-text extraction shared with other document consumers. */
    officeText: OfficeTextService
  }
}

const OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string', required: true, description: 'Canonical absolute document path.' },
    format: { type: 'string', required: true, enum: ['docx', 'pptx', 'xlsx', 'pdf'] },
    text: { type: 'string', required: true, description: 'Extracted plain text, normalized and capped.' },
    chars: { type: 'integer', required: true, description: 'UTF-16 length of the returned text.' },
    truncated: { type: 'boolean', required: true, description: 'Whether the document text exceeded the cap.' },
    pages: { type: 'integer', description: 'Pages read for a PDF or slides read for a presentation.' },
    sheets: { type: 'array', items: { type: 'string' }, description: 'Worksheet names read for a workbook.' },
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

/**
 * Validate one optional cap.
 * @param name - parameter name for the diagnostic.
 * @param value - caller value.
 * @param fallback - configured default.
 * @param cap - configured ceiling.
 * @returns the clamped integer.
 */
function capOf(name: string, value: number | undefined, fallback: number, cap: number): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1) throw new ToolArgsError([`${name} must be a positive integer`])
  return Math.min(value, cap)
}

/**
 * Register the `office_text` tool and provide the extraction service.
 * @param ctx - plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = config as Config
  if (resolved.maxChars > resolved.maxCharsCap) throw new Error('office-text: maxChars must not exceed maxCharsCap')
  if (resolved.maxPages > resolved.maxPagesCap) throw new Error('office-text: maxPages must not exceed maxPagesCap')
  const limits: OfficeTextLimits = resolved
  const service = new OfficeTextService(ctx.fs, limits)
  ctx.provide('officeText', service)

  ctx.tools.register(defineTool({
    name: 'office_text',
    description: 'Read the plain text of a Word (.docx), PowerPoint (.pptx), Excel (.xlsx), or PDF file. Returns paragraphs, slide text, worksheet rows, or PDF page text; long documents are truncated.',
    parameters: {
      path: { type: 'string', required: true, description: 'Document path, resolved by the filesystem backend (relative paths use the Session directory).' },
      max_chars: { type: 'integer', description: 'Maximum characters to return. Defaults to the deployment limit.' },
      max_pages: { type: 'integer', description: 'Maximum PDF pages or presentation slides to read. Defaults to the deployment limit.' },
    },
    output: {
      schema: OUTPUT,
      render: (_args, value) => [{
        type: 'text',
        text: `<path>${value.path}</path>\n<format>${value.format}</format>\n<content>\n${value.text}${value.truncated ? '\n[truncated]' : ''}\n</content>`,
      }],
    },
    async execute(args, exec) {
      if (args.path.trim().length === 0) throw new ToolArgsError(['path must be a non-empty string'])
      const maxChars = capOf('max_chars', args.max_chars, limits.maxChars, limits.maxCharsCap)
      const maxPages = capOf('max_pages', args.max_pages, limits.maxPages, limits.maxPagesCap)
      const target = await ctx.fs.resolve(args.path, await resolveOptions(ctx, exec))
      const result = await service.extract(target, { maxChars, maxPages }, exec.signal)
      return {
        path: ctx.fs.processPath(target),
        format: result.format as OfficeTextFormat,
        text: result.text,
        chars: result.chars,
        truncated: result.truncated,
        ...result.pages === undefined ? {} : { pages: result.pages },
        ...result.sheets === undefined ? {} : { sheets: [...result.sheets] },
      }
    },
  }))
}
