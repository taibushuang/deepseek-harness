/** Structured failures from the folder organizer. */
import { HarnessError } from '@deepseek-ai/dsh-error'

/** Failure classes the organizer reports to the model. */
export type OrganizerErrorCode =
  | 'ORGANIZER_BATCH_NOT_FOUND'
  | 'ORGANIZER_BATCH_STATE'
  | 'ORGANIZER_BUSY'
  | 'ORGANIZER_INVALID_RULE'
  | 'ORGANIZER_INVALID_DIRECTORY'

/** A requested organize operation cannot run as asked. */
export class OrganizerError extends HarnessError {
  override readonly code: OrganizerErrorCode

  /**
   * @param message - actionable description naming the batch or rule.
   * @param code - failure class.
   * @param options - standard cause chaining.
   */
  constructor(message: string, code: OrganizerErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
  }
}
