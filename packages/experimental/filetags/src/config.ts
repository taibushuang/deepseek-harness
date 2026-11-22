/** Plugin configuration shared by the entry and its tests. */

import z from '@deepseek-ai/schemastery'
import { dshPath } from '@deepseek-ai/dsh-home-paths'

/** Plugin configuration. */
export interface Config {
  /** Absolute path of the central tag database file. */
  path: string
}

/** Schemastery validator for {@link Config}. */
export const schema: z<Config> = z.object({
  path: z.string().default(dshPath('data', 'filetags.db')).description('Central tag database file; created owner-only on first use.'),
})
