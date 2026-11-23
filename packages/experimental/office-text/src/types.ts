/** Client-safe result of one plain-text extraction. */

/** Formats this package reads. */
export type OfficeTextFormat = 'docx' | 'pptx' | 'xlsx' | 'pdf'

/** Extraction result for one document. */
export interface OfficeTextResult {
  /** Detected document family. */
  readonly format: OfficeTextFormat
  /** Extracted plain text, normalized and capped. */
  readonly text: string
  /** UTF-16 length of {@link text}. */
  readonly chars: number
  /** Whether the complete document text exceeded the cap. */
  readonly truncated: boolean
  /** Pages read for a PDF, or slides read for a presentation. */
  readonly pages?: number
  /** Worksheet names read for a workbook. */
  readonly sheets?: readonly string[]
}
