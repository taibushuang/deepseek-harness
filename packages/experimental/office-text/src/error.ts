/** Structured failures from plain-text document extraction. */
import { HarnessError } from '@deepseek-ai/dsh-error'

/** Failure classes extraction reports without exposing parser diagnostics. */
export type OfficeTextErrorCode =
  | 'OFFICE_TEXT_UNSUPPORTED'
  | 'OFFICE_TEXT_INVALID'
  | 'OFFICE_TEXT_TOO_LARGE'

/** A document could not be read as the declared format. */
export class OfficeTextError extends HarnessError {
  override readonly code: OfficeTextErrorCode

  /**
   * @param message - actionable description naming the format and next step.
   * @param code - failure class.
   * @param options - standard cause chaining.
   */
  constructor(message: string, code: OfficeTextErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
  }
}
