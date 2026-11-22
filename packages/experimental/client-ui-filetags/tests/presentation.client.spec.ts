import { describe, expect, it } from 'vitest'
import { expressionOf, filterEntries, filterTags, tagNamesOf, toggleTag } from '../src/client/presentation.ts'
import type { TaggedEntry, TagSummary } from '@deepseek-ai/dsh-filetags/types'

const TAGS: readonly TagSummary[] = [
  { name: 'archive', count: 3 },
  { name: 'project', count: 2 },
  { name: 'draft', count: 1 },
]

const ENTRIES: readonly TaggedEntry[] = [
  { path: '/home/me/notes/a.md', isDir: false, tags: ['project'] },
  { path: '/home/me/work', isDir: true, tags: ['project', 'draft'] },
  { path: '/home/me/archive/old.md', isDir: false, tags: ['archive'] },
]

describe('tag panel presentation', () => {
  it('builds a conjunction from the selection and toggles names in place', () => {
    expect(expressionOf([])).toBe('')
    expect(expressionOf(['project', 'draft'])).toBe('project and draft')
    expect(toggleTag([], 'project')).toEqual(['project'])
    expect(toggleTag(['project', 'draft'], 'project')).toEqual(['draft'])
    expect(toggleTag(['project'], 'archive')).toEqual(['project', 'archive'])
  })

  it('splits a typed tag list on spaces and commas', () => {
    expect(tagNamesOf('  project, draft  ')).toEqual(['project', 'draft'])
    expect(tagNamesOf('   ')).toEqual([])
  })

  it('filters tag names by substring and keeps display order for equal matches', () => {
    expect(filterTags(TAGS, '').map(tag => tag.name)).toEqual(['archive', 'project', 'draft'])
    expect(filterTags(TAGS, 'pr').map(tag => tag.name)).toEqual(['project'])
    expect(filterTags(TAGS, 'arc').map(tag => tag.name)).toEqual(['archive'])
    expect(filterTags(TAGS, 'zzz')).toEqual([])
  })

  it('matches paths only as contiguous substrings', () => {
    expect(filterEntries(ENTRIES, '').map(entry => entry.path)).toEqual(ENTRIES.map(entry => entry.path))
    expect(filterEntries(ENTRIES, 'archive').map(entry => entry.path)).toEqual(['/home/me/archive/old.md'])
    expect(filterEntries(ENTRIES, 'work').map(entry => entry.path)).toEqual(['/home/me/work'])
    expect(filterEntries(ENTRIES, 'hw').map(entry => entry.path)).toEqual([])
  })
})
