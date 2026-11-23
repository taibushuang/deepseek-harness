/**
 * Format dispatch and text normalization for plain-text document extraction.
 * @module @deepseek-ai/dsh-office-text/extract
 */

import { OfficeTextError } from './error.ts'
import { extractDocx, extractPptx } from './ooxml.ts'
import { extractPdf } from './pdf.ts'
import { extractXlsx } from './xlsx.ts'
import type { OfficeTextFormat, OfficeTextResult } from './types.ts'

/** Extensions this package reads, mapped to their document family. */
const FORMAT_BY_EXTENSION: Readonly<Record<string, OfficeTextFormat>> = {
  '.docx': 'docx',
  '.docm': 'docx',
  '.pptx': 'pptx',
  '.pptm': 'pptx',
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsx',
  '.pdf': 'pdf',
}

/**
 * Detect the document family of one path.
 * @param path - display or absolute path.
 * @returns the format, or undefined for an unsupported extension.
 */
export function formatOf(path: string): OfficeTextFormat | undefined {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return undefined
  return FORMAT_BY_EXTENSION[path.slice(dot).toLowerCase()]
}

/**
 * Collapse line-ending and whitespace noise without changing words.
 * @param text - raw extractor output.
 * @returns normalized text.
 */
function normalize(text: string): string {
  return text
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[ \t]+\t/gu, '\t')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

/**
 * Cap extracted text at the caller's character limit.
 * @param text - normalized text.
 * @param maxChars - maximum retained characters.
 * @returns the retained text and whether anything was dropped.
 */
function cap(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

/** Input one extraction receives. */
export interface OfficeTextInput {
  /** Complete file bytes. */
  readonly bytes: Uint8Array
  /** Document family detected from the extension. */
  readonly format: OfficeTextFormat
  /** Maximum retained characters. */
  readonly maxChars: number
  /** Maximum PDF pages or presentation slides read. */
  readonly maxPages: number
}

/**
 * Extract normalized plain text from one document.
 * @param input - bytes, family, and caps.
 * @returns the extracted result.
 * @throws {OfficeTextError} for an unsupported family, an invalid package, or an oversized part.
 */
export async function extractOfficeText(input: OfficeTextInput): Promise<OfficeTextResult> {
  let raw: string
  let pages: number | undefined
  let sheets: readonly string[] | undefined
  switch (input.format) {
    case 'docx':
      raw = extractDocx(input.bytes)
      break
    case 'pptx': {
      const result = extractPptx(input.bytes, input.maxPages)
      raw = result.text
      pages = result.slides
      break
    }
    case 'xlsx': {
      const result = await extractXlsx(input.bytes, input.maxPages)
      raw = result.text
      sheets = result.sheets
      break
    }
    case 'pdf': {
      const result = await extractPdf(input.bytes, input.maxPages)
      raw = result.text
      pages = result.pages
      break
    }
    /* v8 ignore next 2 -- the switch covers the closed OfficeTextFormat union. */
    default:
      throw new OfficeTextError(`unsupported document format: ${String(input.format)}`, 'OFFICE_TEXT_UNSUPPORTED')
  }
  const normalized = normalize(raw)
  const retained = cap(normalized, input.maxChars)
  return {
    format: input.format,
    text: retained.text,
    chars: retained.text.length,
    truncated: retained.truncated,
    ...pages === undefined ? {} : { pages },
    ...sheets === undefined ? {} : { sheets },
  }
}
