/** Rule validation and pure planning. */
import type { FsDirEntry } from '@deepseek-ai/dsh-fs'
import { describe, expect, it } from 'vitest'
import { compileRules, normalizeTarget, planMoves } from '../src/rules.ts'

/** One listing entry. */
function entry(name: string, type: 'file' | 'directory' | 'other' = 'file'): FsDirEntry {
  return { name, type, target: { targetKey: name as never, displayPath: `/dir/${name}` } }
}

describe('normalizeTarget', () => {
  it('normalizes separators and rejects escapes', () => {
    expect(normalizeTarget('documents/')).toBe('documents')
    expect(normalizeTarget('./a/b')).toBe('a/b')
    expect(normalizeTarget('a\\b')).toBe('a/b')
    expect(() => normalizeTarget('')).toThrow('must name a directory')
    expect(() => normalizeTarget('.')).toThrow('must name a directory')
    expect(() => normalizeTarget('/abs')).toThrow('must stay below')
    expect(() => normalizeTarget('../up')).toThrow('must stay below')
    expect(() => normalizeTarget('a//b')).toThrow('must stay below')
    expect(() => normalizeTarget('a\0b')).toThrow('NUL')
  })
})

describe('planMoves', () => {
  it('carries rule tags and rejected tag words', () => {
    const rules = compileRules([{ pattern: '*.pdf', target: 'docs', tags: ['invoice', 'work'] }])
    expect(planMoves('/root', [entry('a.pdf')], rules, undefined).moves[0]?.tags).toEqual(['invoice', 'work'])
    expect(() => compileRules([{ pattern: '*', target: 'x', tags: ['two words'] }]))
      .toThrow('must be one word')
  })

  it('uses first-match rules and reports each skip reason', () => {
    const rules = compileRules([{ pattern: '*.pdf', target: 'docs' }, { pattern: '*.pdf', target: 'second' }])
    const plan = planMoves('/root', [entry('a.pdf'), entry('.hidden'), entry('folder', 'directory'), entry('x.txt'), entry('link', 'other')], rules, 'other')
    expect(plan.moves).toEqual([
      { from: '/dir/a.pdf', to: '/root/docs/a.pdf' },
      { from: '/dir/x.txt', to: '/root/other/x.txt' },
    ])
    expect(plan.skipped.map(skip => skip.reason)).toEqual(['hidden', 'not-a-file', 'not-a-file'])
  })
})
