/**
 * PDF text extraction through the pdfjs legacy build, which runs in Node
 * without a DOM or bundled worker. Pages are read in order and capped.
 * @module @deepseek-ai/dsh-office-text/pdf
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { OfficeTextError } from './error.ts'

/**
 * Extract the text layer of the first `maxPages` pages.
 * @param bytes - PDF bytes.
 * @param maxPages - pages to read from the start.
 * @returns the extracted text and the number of pages read.
 */
export async function extractPdf(bytes: Uint8Array, maxPages: number): Promise<{ text: string; pages: number }> {
  const task = getDocument({
    // pdfjs rejects Node Buffer instances even though they extend Uint8Array.
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    useSystemFonts: false,
    disableFontFace: true,
  })
  try {
    const document = await task.promise
    const pages = Math.min(document.numPages, maxPages)
    const sections: string[] = []
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        /* v8 ignore next -- marked-content entries carry no text and are absent from text-only fixtures. */
        if (!('str' in item)) continue
        text += item.str
        if (item.hasEOL) text += '\n'
      }
      sections.push(text)
      page.cleanup()
    }
    return { text: sections.join('\n\n'), pages }
  } catch (error) {
    throw new OfficeTextError('cannot read the PDF: the file is not a valid PDF document', 'OFFICE_TEXT_INVALID', { cause: error })
  } finally {
    await task.destroy()
  }
}
