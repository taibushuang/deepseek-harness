/** Plugin configuration shared by the entry and its tests. */

import z from '@deepseek-ai/schemastery'
import { dshPath } from '@deepseek-ai/dsh-home-paths'

/** Plugin configuration. */
export interface Config {
  /** Absolute path of the central tag database file. */
  path: string
  /** Maximum files and directories one legacy import scans. */
  maxImportEntries?: number
  /** Maximum imported entries echoed by one result. */
  maxImportDisplay?: number
}

/** Schemastery validator for {@link Config}. */
export const schema: z<Config> = z.object({
  path: z.string().default(dshPath('data', 'filetags.db')).description('Central tag database file; created owner-only on first use.'),
  maxImportEntries: z.number().step(1).min(1).default(10000).description('Maximum files and directories one legacy import scans.'),
  maxImportDisplay: z.number().step(1).min(1).default(50).description('Maximum imported entries echoed by one result.'),
})
