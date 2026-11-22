/** Native file-action contribution shared by delivery cards and change review. */
import type { PresentedOpenOutcome } from './present-open.ts'
import type { PresentedAction } from '../presented.ts'

/** Owner face both file-action slots hand to their entries. */
export interface FileActionOwner {
  /** Authenticated document-relative action route carrying Session event coordinates. */
  readonly actionUrl: string
  readonly available: boolean
  readonly pending: boolean
  /** Execute the selected native action, publish status on the owning file surface, and report what settled. */
  readonly onAction: (action: PresentedAction, application?: string) => Promise<PresentedOpenOutcome>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Open one file through its authorized Session event coordinates. */
    'deliverables.file.actions': {
      kind: 'list'
      scope: 'session'
      owner: FileActionOwner
    }
    /** The same file actions owned by a changed-file review tab. */
    'deliverables.review.file.actions': {
      kind: 'list'
      scope: 'session'
      owner: FileActionOwner
    }
  }
}
