/** Minimal OOXML, workbook, and PDF fixtures built in memory. */
import ExcelJS from 'exceljs'
import { strToU8, zipSync } from 'fflate'

const DOCX_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/**
 * Build a DOCX package around one body XML fragment.
 * @param body - `w:body` content.
 * @returns the package bytes.
 */
export function docx(body: string): Uint8Array {
  return zipSync({
    'word/document.xml': strToU8(`<w:document ${DOCX_NS}><w:body>${body}</w:body></w:document>`),
  })
}

/**
 * Build a PPTX package with one part per slide.
 * @param slides - `p:sld` content per slide, in order.
 * @returns the package bytes.
 */
export function pptx(slides: readonly string[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  slides.forEach((slide, index) => {
    entries[`ppt/slides/slide${index + 1}.xml`] = strToU8(
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${slide}</p:spTree></p:cSld></p:sld>`,
    )
  })
  return zipSync(entries)
}

/**
 * Build one paragraph of Word runs.
 * @param text - paragraph text.
 * @returns the paragraph XML.
 */
export function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
}

/**
 * Build one presentation paragraph.
 * @param text - paragraph text.
 * @returns the shape XML.
 */
export function slideParagraph(text: string): string {
  return `<p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
}

/**
 * Wrap one content stream in a minimal one-page PDF.
 * @param stream - PDF content stream operators.
 * @returns the PDF bytes.
 */
function buildPdf(stream: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let document = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(document))
    document += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(document)
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) document += `${String(offset).padStart(10, '0')} 00000 n \n`
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(document, 'latin1'))
}

/**
 * Build a single-page PDF with one text run per line.
 * @param lines - ASCII lines drawn at 20pt intervals.
 * @returns the PDF bytes.
 */
export function pdfLines(lines: readonly string[]): Uint8Array {
  const body = lines.map((line, index) => `${index === 0 ? '' : '0 -20 Td '}(${line}) Tj`).join(' ')
  return buildPdf(`BT /F1 12 Tf 20 160 Td ${body} ET`)
}

/**
 * Build a single-page PDF with several text runs on one baseline.
 * @param runs - ASCII runs drawn in order.
 * @returns the PDF bytes.
 */
export function pdfRuns(runs: readonly string[]): Uint8Array {
  return buildPdf(`BT /F1 12 Tf 20 100 Td ${runs.map(run => `(${run}) Tj`).join(' ')} ET`)
}

/**
 * Build a single-page PDF with one text run.
 * @param text - ASCII text to draw.
 * @returns the PDF bytes.
 */
export function pdf(text: string): Uint8Array {
  return pdfRuns([text])
}


/**
 * Build an XLSX workbook from rows of display values.
 * @param rows - cell values per row, first row used as written.
 * @param sheetName - worksheet name.
 * @returns the workbook bytes.
 */
export async function workbook(rows: readonly (readonly (string | number)[])[], sheetName: string): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet(sheetName)
  for (const row of rows) sheet.addRow([...row])
  const buffer = await book.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}
