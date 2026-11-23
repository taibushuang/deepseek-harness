/**
 * The Remote contribution and the tag panel leave together: mounting registers
 * dictionaries, the tab type, and both seats; disposal withdraws them and calls
 * the contribution's unmount.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteError, type RemoteResult, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { TaggedEntry, TagSummary } from '@deepseek-ai/dsh-filetags/types'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { apply as browserEntry } from '../src/client/index.ts'
import { createFace, mountFiletags } from '../src/client/mount.ts'
import { FILETAGS_ID, FILETAGS_KIND } from '../src/client/definition.ts'

const contribution: TypertRemoteContribution = { package: '@deepseek-ai/dsh-filetags', descriptors: [] }

/**
 * Boot the smallest Client context that can mount the panel.
 * @param mount - what `$mount` returns.
 * @returns the context, the recorded registrations, and helpers.
 */
async function fixture(
  mount = vi.fn(async () => vi.fn(async () => {})),
  customRegistry?: { register: (definition: SidebarRightTabDefinition) => () => void },
) {
  const definitions: SidebarRightTabDefinition[] = []
  const registry = customRegistry ?? {
    register: (definition: SidebarRightTabDefinition): () => void => {
      definitions.push(definition)
      return () => { definitions.splice(definitions.indexOf(definition), 1) }
    },
  }
  const ctx = new Context()
  class TestRemote extends Service {
    constructor() { super(ctx, 'remote') }
    $mount = mount
  }
  new TestRemote()
  ctx.provide('sidebarRightTabs', registry as never)
  const listTags = vi.fn(async (): Promise<RemoteResult<readonly TagSummary[]>> => ({ ok: true, value: [] }))
  const search = vi.fn(async (): Promise<RemoteResult<readonly TaggedEntry[]>> => ({ ok: true, value: [] }))
  const tag = vi.fn(async (): Promise<RemoteResult<number>> => ({ ok: true, value: 1 }))
  const untag = vi.fn(async (): Promise<RemoteResult<number>> => ({ ok: true, value: 1 }))
  ctx.provide('remote.fileTags', { listTags, search, tag, untag } as never)
  ctx.provide('openInApp', {
    available: async () => true,
    open: async () => ({ kind: 'opened' }),
  } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
    'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
  } } as never, () => null)
  return {
    ctx, definitions, mount, listTags, search, tag, untag,
    keys: (slot: 'sidebar.right.pane.tab') => ctx.slots.entries(slot).map(entry => entry.options.key),
  }
}

it('mounts the Remote, registers the tab type and seats, and withdraws both on disposal', async () => {
  const value = await fixture()
  const dispose = await mountFiletags(value.ctx, contribution)
  expect(value.mount).toHaveBeenCalledWith(contribution)
  expect(value.definitions).toHaveLength(1)
  expect(value.definitions[0]).toMatchObject({ id: FILETAGS_ID, kind: FILETAGS_KIND })
  expect(value.definitions[0]!.title('')).toBe('Tags')
  expect(value.definitions[0]!.guide?.[0]?.title()).toBe('Tags')
  expect(value.definitions[0]!.guide?.[0]?.description?.()).toContain('Browse tags')
  expect(value.keys('sidebar.right.pane.tab')).toEqual([FILETAGS_ID])

  const [entry] = value.ctx.slots.entries('sidebar.right.pane.tab')
  const inject = entry?.inject as (() => { face: { canOpen(signal: AbortSignal): Promise<boolean> } }) | undefined
  if (inject === undefined) throw new Error('the panel registered no inject face')
  const injected = inject()
  expect(injected).toMatchObject({ face: expect.any(Object) })
  expect(await injected.face.canOpen(new AbortController().signal)).toBe(true)

  await dispose()
  expect(value.definitions).toHaveLength(0)
  expect(value.keys('sidebar.right.pane.tab')).toEqual([])
  await value.ctx.fiber.dispose()
})

it('mounts and withdraws through the browser entry', async () => {
  const value = await fixture()
  const dispose = await browserEntry(value.ctx)
  expect(value.mount).toHaveBeenCalledOnce()
  expect(value.definitions).toHaveLength(1)
  await dispose()
  expect(value.definitions).toHaveLength(0)
})

it('withdraws the Remote it mounted when the panel cannot register', async () => {
  const unmount = vi.fn(async () => {})
  const value = await fixture(vi.fn(async () => unmount), { register: () => { throw new Error('registry closed') } })
  await expect(mountFiletags(value.ctx, contribution)).rejects.toThrow('registry closed')
  expect(unmount).toHaveBeenCalledOnce()
})

it('unwraps successful Remote results and rethrows failures', async () => {
  const failure = new RemoteError('filetags/invalid-argument', 'bad tag', {})
  const failedList = async (): Promise<RemoteResult<readonly TagSummary[]>> => ({ ok: false, error: failure })
  const failedSearch = async (): Promise<RemoteResult<readonly TaggedEntry[]>> => ({ ok: false, error: failure })
  const failedCount = async (): Promise<RemoteResult<number>> => ({ ok: false, error: failure })
  const namespace = {
    listTags: vi.fn(async () => ({ ok: true as const, value: [{ name: 'work', count: 1 }] })),
    search: vi.fn(async () => ({ ok: true as const, value: [] })),
    tag: vi.fn(async () => ({ ok: false as const, error: failure })),
    untag: vi.fn(async () => ({ ok: true as const, value: 1 })),
  }
  const face = createFace(namespace)
  const signal = new AbortController().signal
  expect(await face.listTags(signal)).toEqual([{ name: 'work', count: 1 }])
  expect(await face.search('work', signal)).toEqual([])
  await expect(face.tag('/tmp/a', ['work'], signal)).rejects.toBe(failure)
  await face.untag('/tmp/a', 'work', signal)
  expect(namespace.search).toHaveBeenCalledWith({ expression: 'work' }, signal)
  expect(namespace.tag).toHaveBeenCalledWith({ paths: ['/tmp/a'], tags: ['work'] }, signal)
  expect(namespace.untag).toHaveBeenCalledWith({ paths: ['/tmp/a'], tags: ['work'] }, signal)
  const failing = createFace({
    listTags: vi.fn(failedList),
    search: vi.fn(failedSearch),
    tag: vi.fn(failedCount),
    untag: vi.fn(failedCount),
  })
  await expect(failing.listTags(signal)).rejects.toBe(failure)
  await expect(failing.search('work', signal)).rejects.toBe(failure)
  await expect(failing.untag('/tmp/a', 'work', signal)).rejects.toBe(failure)
  const opening = createFace(namespace, { available: async () => true, open: async () => ({ kind: 'opened' }) })
  const refused = createFace(namespace, { available: async () => true, open: async () => ({ kind: 'failed' }) })
  const skipped = createFace(namespace, { available: async () => true, open: async () => ({ kind: 'skipped' }) })
  expect(await face.canOpen(signal)).toBe(false)
  await expect(face.open('/tmp/a', signal)).rejects.toThrow('no desktop application surface')
  expect(await opening.canOpen(signal)).toBe(true)
  await opening.open('/tmp/a', signal)
  await expect(refused.open('/tmp/a', signal)).rejects.toThrow('the path could not be opened')
  await skipped.open('/tmp/a', signal)
  const writing = createFace({ ...namespace, tag: vi.fn(async () => ({ ok: true as const, value: 1 })) })
  await writing.tag('/tmp/a', ['work'], signal)
  expect(face.invalidArgument(failure)).toBe(true)
  expect(face.invalidArgument(new Error('x'))).toBe(false)
  expect(face.invalidArgument('x')).toBe(false)
  expect(face.invalidArgument(null)).toBe(false)
})
