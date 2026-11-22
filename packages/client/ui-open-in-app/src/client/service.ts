/**
 * Native path opening for panels outside the document and file seats. One page
 * lifetime resolves Host desktop availability once, then opens or reveals an
 * absolute Host path through the same controller the file controls use.
 * @module @deepseek-ai/dsh-client-ui-open-in-app/service
 */

import type { OpenInAppOutcome } from './outcome.ts'
import type { OpenInAppPathController } from './open-path.ts'

/** The Client surface a panel calls to open an absolute path in its native application. */
export class OpenInAppService {
  /**
   * @param paths - page-lifetime controller owning availability and the open/reveal carrier.
   */
  constructor(private readonly paths: OpenInAppPathController) {}

  /**
   * Resolve whether this page can hand paths to a Host desktop. The Host answer is
   * read once; Web, an unreachable Host, and a refused answer all read as false.
   * @returns true when a native open can succeed.
   */
  async available(): Promise<boolean> {
    await this.paths.load()
    return this.paths.desktop.getSnapshot() === true
  }

  /**
   * Open one absolute Host path in its default application.
   * @param path - absolute path on the Host.
   * @returns the acknowledged, failed, or skipped gesture.
   */
  async open(path: string): Promise<OpenInAppOutcome> {
    return await this.paths.openPath(path, 'open')
  }

  /**
   * Reveal one absolute Host path in the file manager.
   * @param path - absolute path on the Host.
   * @returns the acknowledged, failed, or skipped gesture.
   */
  async reveal(path: string): Promise<OpenInAppOutcome> {
    return await this.paths.openPath(path, 'reveal')
  }
}
