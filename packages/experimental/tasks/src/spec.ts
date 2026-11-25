/** Durable personal-task domain. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { task } from './types.ts'

/** One `tasks` table keyed by task id. */
export const tasksDomain = defineDomain({
  name: 'tasks',
  version: 1,
  tables: { tasks: domainTable<string, import('./types.ts').TaskRecord>(task) },
})
