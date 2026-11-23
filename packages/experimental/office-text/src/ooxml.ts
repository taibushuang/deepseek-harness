/**
 * Word and PowerPoint text extraction from OOXML packages: one password-free
 * ZIP read, then an order-preserving XML walk that keeps paragraphs, table
 * cells, tabs, and line breaks readable.
 * @module @deepseek-ai/dsh-office-text/ooxml
 */

import { strFromU8, unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { OfficeTextError } from './error.ts'

/** One parsed preserve-order node: a tag name mapped to its children. */
type XmlNode = Record<string, unknown>

/** The largest single OOXML part extraction will decompress. */
const PART_LIMIT_BYTES = 32 * 1024 * 1024
/** The largest combined decompressed text-parts budget. */
const TOTAL_LIMIT_BYTES = 128 * 1024 * 1024

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: false,
  processEntities: true,
})

/**
 * Extract the paragraph text of one OOXML part.
 * @param xml - decompressed part XML.
 * @param tableColumns - whether table cells end with a tab and rows with a newline.
 * @returns the raw extracted text.
 */
function walkPart(xml: string, tableColumns: boolean): string {
  const parsed = parser.parse(xml) as XmlNode[]
  const out: string[] = []
  const walk = (nodes: readonly XmlNode[], inCell: boolean): void => {
    for (const node of nodes) {
      for (const [key, value] of Object.entries(node)) {
        /* v8 ignore next -- preserveOrder exposes attributes only with ignoreAttributes disabled. */
        if (key === ':@') continue
        if (!Array.isArray(value)) {
          /* v8 ignore next -- a '#text' key always carries a scalar string. */
          if (key === '#text') out.push(String(value))
          continue
        }
        if (key === 'tab') {
          out.push('\t')
          continue
        }
        if (key === 'br' || key === 'cr') {
          out.push('\n')
          continue
        }
        if (tableColumns && key === 'tc') {
          walk(value as XmlNode[], true)
          out.push('\t')
          continue
        }
        if (tableColumns && key === 'tr') {
          walk(value as XmlNode[], inCell)
          out.push('\n')
          continue
        }
        walk(value as XmlNode[], inCell)
        if (key === 'p') out.push(inCell ? ' ' : '\n')
      }
    }
  }
  walk(parsed, false)
  return out.join('')
}

/** Decompression ceilings, overridable for focused size-limit tests. */
export interface PartLimits {
  /** Largest single part accepted. */
  readonly partBytes: number
  /** Largest combined decompressed budget. */
  readonly totalBytes: number
}

/**
 * Read one wanted part, enforcing the per-part and combined decompression caps.
 * @param bytes - OOXML package bytes.
 * @param wanted - predicate over part names.
 * @param limits - optional ceilings; omission uses the package defaults.
 * @returns the decompressed parts in archive order.
 */
export function readParts(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  limits: PartLimits = { partBytes: PART_LIMIT_BYTES, totalBytes: TOTAL_LIMIT_BYTES },
): { name: string; xml: string }[] {
  let total = 0
  const skipped: string[] = []
  let parts: Record<string, Uint8Array>
  try {
    parts = unzipSync(bytes, {
      filter: (file) => {
        if (!wanted(file.name)) return false
        if (file.originalSize > limits.partBytes) {
          skipped.push(file.name)
          return false
        }
        total += file.originalSize
        return total <= limits.totalBytes
      },
    })
  } catch (error) {
    throw new OfficeTextError('cannot read the document package: it is not a valid ZIP archive', 'OFFICE_TEXT_INVALID', { cause: error })
  }
  if (skipped.length > 0) {
    throw new OfficeTextError(`cannot read the document: part ${JSON.stringify(skipped[0])} exceeds the per-part limit`, 'OFFICE_TEXT_TOO_LARGE')
  }
  return Object.entries(parts).map(([name, data]) => ({
    name,
    xml: strFromU8(data, false),
  }))
}

/**
 * Extract Word body text.
 * @param bytes - document package.
 * @returns the extracted text.
 */
export function extractDocx(bytes: Uint8Array): string {
  const parts = readParts(bytes, name => name === 'word/document.xml')
  const part = parts[0]
  if (part === undefined) {
    throw new OfficeTextError('cannot read the document: word/document.xml is missing', 'OFFICE_TEXT_INVALID')
  }
  return walkPart(part.xml, true)
}

/**
 * Extract presentation text, one section per slide in numeric order.
 * @param bytes - presentation package.
 * @param maxSlides - slides to read from the start.
 * @returns the extracted text and the number of slides read.
 */
export function extractPptx(bytes: Uint8Array, maxSlides: number): { text: string; slides: number } {
  const slideName = /^ppt\/slides\/slide(\d+)\.xml$/u
  const parts = readParts(bytes, name => slideName.test(name))
  if (parts.length === 0) {
    throw new OfficeTextError('cannot read the presentation: no ppt/slides parts are present', 'OFFICE_TEXT_INVALID')
  }
  const ordered = parts
    .map(part => ({ ...part, index: Number(slideName.exec(part.name)?.[1]) }))
    .sort((left, right) => left.index - right.index)
    .slice(0, maxSlides)
  const text = ordered.map(part => `## Slide ${String(part.index)}\n${walkPart(part.xml, false)}`).join('\n\n')
  return { text, slides: ordered.length }
}
