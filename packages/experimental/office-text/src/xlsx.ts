/**
 * Workbook text extraction through ExcelJS: worksheet names, then visible cell
 * values as tab-separated rows. Dates use ISO form; rich text, formulas with a
 * cached result, and hyperlink text keep their display value.
 * @module @deepseek-ai/dsh-office-text/xlsx
 */

import ExcelJS from 'exceljs'
import { OfficeTextError } from './error.ts'

/**
 * Render one cell value as display text.
 * @param value - ExcelJS cell value.
 * @returns the visible text, never undefined.
 */
function cellText(value: unknown): string {
  /* v8 ignore next -- ExcelJS row.values publishes dense cells, so extraction never sees null. */
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const candidate = value as {
      richText?: readonly { text?: string }[]
      text?: unknown
      result?: unknown
      formula?: unknown
    }
    /* v8 ignore next -- ExcelJS rich-text runs always carry text. */
    if (Array.isArray(candidate.richText)) return candidate.richText.map(run => run.text ?? '').join('')
    if (candidate.text !== undefined) return String(candidate.text)
    if (candidate.result !== undefined) return String(candidate.result)
    return ''
  }
  return String(value)
}

/**
 * Extract every worksheet as text.
 * @param bytes - workbook bytes.
 * @param maxSheets - worksheets to read from the start.
 * @returns the extracted text and the worksheet names read.
 */
export async function extractXlsx(bytes: Uint8Array, maxSheets: number): Promise<{ text: string; sheets: string[] }> {
  // A spreadsheet is a ZIP package; without this check a text file would be
  // accepted as a degenerate workbook by some readers.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new OfficeTextError('cannot read the workbook: the file is not a valid Excel package', 'OFFICE_TEXT_INVALID')
  }
  const workbook = new ExcelJS.Workbook()
  try {
    // ExcelJS declares `Buffer`, whose Node typing differs across the versions
    // this workspace resolves; the runtime accepts any Uint8Array, so invoke the
    // method without narrowing through that mismatched declaration.
    const loading: Promise<unknown> = Reflect.apply(workbook.xlsx.load, workbook.xlsx, [bytes])
    await loading
  } catch (error) {
    throw new OfficeTextError('cannot read the workbook: the file is not a valid Excel package', 'OFFICE_TEXT_INVALID', { cause: error })
  }
  const sheets: string[] = []
  const sections: string[] = []
  for (const worksheet of workbook.worksheets.slice(0, maxSheets)) {
    sheets.push(worksheet.name)
    const lines = [`## ${worksheet.name}`]
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      /* v8 ignore next -- ExcelJS always publishes row.values as an array. */
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      const cells = values.map(cellText)
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      if (cells.some(cell => cell !== '')) lines.push(cells.join('\t'))
    })
    sections.push(lines.join('\n'))
  }
  return { text: sections.join('\n\n'), sheets }
}
