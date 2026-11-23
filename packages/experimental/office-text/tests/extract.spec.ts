/** Format dispatch, text normalization, caps, and package failures. */
import ExcelJS from 'exceljs'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { extractOfficeText, formatOf } from '../src/extract.ts'
import { OfficeTextError } from '../src/error.ts'
import { readParts } from '../src/ooxml.ts'
import { docx, paragraph, pdf, pdfLines, pdfRuns, pptx, slideParagraph, workbook } from './fixtures.ts'

const LIMITS = { maxChars: 20_000, maxPages: 50 }

describe('format detection', () => {
  it('recognizes supported extensions case-insensitively and rejects others', () => {
    expect(formatOf('/x/A.DOCX')).toBe('docx')
    expect(formatOf('b.docm')).toBe('docx')
    expect(formatOf('c.pptx')).toBe('pptx')
    expect(formatOf('d.pptm')).toBe('pptx')
    expect(formatOf('e.xlsx')).toBe('xlsx')
    expect(formatOf('f.xlsm')).toBe('xlsx')
    expect(formatOf('g.pdf')).toBe('pdf')
    expect(formatOf('h.doc')).toBeUndefined()
    expect(formatOf('Makefile')).toBeUndefined()
  })
})

describe('docx', () => {
  it('reads paragraphs, tabs, line breaks, and table cells in document order', async () => {
    const body = `<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/><w:t>World</w:t></w:r><w:r><w:br/><w:t>Next</w:t></w:r><w:r><w:cr/></w:r></w:p>${paragraph('Second')}`
      + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    const result = await extractOfficeText({ bytes: docx(body), format: 'docx', ...LIMITS })
    expect(result.format).toBe('docx')
    expect(result.text).toContain('Hello\tWorld\nNext')
    expect(result.text).toContain('Second')
    expect(result.text).toContain('A\tB')
    expect(result.truncated).toBe(false)
    expect(result.chars).toBe(result.text.length)
  })

  it('fails when the body part is missing', async () => {
    await expect(extractOfficeText({
      bytes: zipSync({ 'docProps/core.xml': strToU8('<x/>') }), format: 'docx', ...LIMITS,
    })).rejects.toThrow('word/document.xml is missing')
  })
})

describe('pptx', () => {
  it('reads slides in numeric order with slide headings', async () => {
    const bytes = pptx([slideParagraph('First slide'), slideParagraph('Second slide')])
    const result = await extractOfficeText({ bytes, format: 'pptx', maxChars: 20_000, maxPages: 1 })
    expect(result.pages).toBe(1)
    expect(result.text).toContain('## Slide 1')
    expect(result.text).toContain('First slide')
    expect(result.text).not.toContain('Second slide')
  })

  it('fails when no slide parts exist', async () => {
    await expect(extractOfficeText({
      bytes: zipSync({ 'ppt/presentation.xml': strToU8('<x/>') }), format: 'pptx', ...LIMITS,
    })).rejects.toThrow('no ppt/slides parts')
  })
})

describe('xlsx', () => {
  it('reads formatted cell text per worksheet', async () => {
    const bytes = await workbook([['Name', 'Count'], ['Alpha', 2]], 'Tasks')
    const result = await extractOfficeText({ bytes, format: 'xlsx', ...LIMITS })
    expect(result.sheets).toEqual(['Tasks'])
    expect(result.text).toContain('## Tasks')
    expect(result.text).toContain('Name\tCount')
    expect(result.text).toContain('Alpha\t2')
  })

  it('renders rich text, hyperlink text, cached formula results, dates, and blanks', async () => {
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('Cells')
    sheet.addRow(['Plain', 2, true])
    sheet.addRow([new Date(Date.UTC(2026, 0, 2)), { formula: '1+2', result: 3 }, { richText: [{ text: 'Rich' }, { text: 'Text' }] }])
    sheet.addRow([{ text: 'Linked', hyperlink: 'https://example.com' }, null, { formula: 'A1' }])
    sheet.addRow(['', ''])
    const bytes = new Uint8Array(await book.xlsx.writeBuffer())
    const result = await extractOfficeText({ bytes, format: 'xlsx', ...LIMITS })
    expect(result.text).toContain('2026-01-02T00:00:00.000Z')
    expect(result.text).toContain('3')
    expect(result.text).toContain('RichText')
    expect(result.text).toContain('Linked')
  })

  it('fails on a file that is not a workbook', async () => {
    await expect(extractOfficeText({ bytes: strToU8('not a workbook'), format: 'xlsx', ...LIMITS }))
      .rejects.toBeInstanceOf(OfficeTextError)
  })

  it('fails on a ZIP that is not an Excel package', async () => {
    await expect(extractOfficeText({
      bytes: zipSync({ 'readme.txt': strToU8('hello') }), format: 'xlsx', ...LIMITS,
    })).rejects.toMatchObject({ code: 'OFFICE_TEXT_INVALID' })
  })
})

describe('pdf', () => {
  it('reads page text', async () => {
    const result = await extractOfficeText({ bytes: pdf('Hello PDF'), format: 'pdf', ...LIMITS })
    expect(result.pages).toBe(1)
    expect(result.text).toBe('Hello PDF')
  })

  it('joins adjacent text runs and keeps line breaks', async () => {
    expect((await extractOfficeText({ bytes: pdfRuns(['Hello', 'PDF']), format: 'pdf', ...LIMITS })).text).toBe('HelloPDF')
    expect((await extractOfficeText({ bytes: pdfLines(['Line one', 'Line two']), format: 'pdf', ...LIMITS })).text)
      .toBe('Line one\nLine two')
  })

  it('fails on invalid bytes', async () => {
    await expect(extractOfficeText({ bytes: strToU8('not a pdf'), format: 'pdf', ...LIMITS }))
      .rejects.toMatchObject({ code: 'OFFICE_TEXT_INVALID' })
  })
})

describe('caps and package limits', () => {
  it('truncates at the character cap', async () => {
    const result = await extractOfficeText({ bytes: docx(paragraph('abcdef')), format: 'docx', maxChars: 3, maxPages: 1 })
    expect(result).toMatchObject({ text: 'abc', chars: 3, truncated: true })
  })

  it('rejects an invalid ZIP package', async () => {
    await expect(extractOfficeText({ bytes: strToU8('not a zip'), format: 'docx', ...LIMITS }))
      .rejects.toMatchObject({ code: 'OFFICE_TEXT_INVALID' })
  })

  it('rejects a part above the per-part limit', () => {
    const bytes = zipSync({ 'word/document.xml': new Uint8Array(64) })
    expect(() => readParts(bytes, name => name === 'word/document.xml', { partBytes: 8, totalBytes: 1024 }))
      .toThrow('exceeds the per-part limit')
  })

  it('stops reading parts above the combined limit', () => {
    const bytes = zipSync({
      'a.xml': new Uint8Array(10),
      'b.xml': new Uint8Array(10),
    })
    expect(readParts(bytes, () => true, { partBytes: 64, totalBytes: 15 })).toHaveLength(1)
  })
})
