/** Structured task failures. */
import { HarnessError } from '@deepseek-ai/dsh-error'

/** Failure classes the task service reports. */
export type TaskErrorCode = 'TASK_INVALID' | 'TASK_NOT_FOUND' | 'TASK_LIMIT'

/** A task request cannot be applied as asked. */
export class TaskError extends HarnessError {
  override readonly code: TaskErrorCode

  /**
   * @param message - actionable description.
   * @param code - failure class.
   * @param options - standard cause chaining.
   */
  constructor(message: string, code: TaskErrorCode, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
  }
}
