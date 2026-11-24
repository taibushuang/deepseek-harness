/** In-place message retraction over the real AgentLoop and Session Remote owner. */
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, onTestFinished, vi } from 'vitest'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { createSessionTestRemote } from './test-remote.ts'
import { brandString } from '@deepseek-ai/dsh-brand'

async function setup(script: ConstructorParameters<typeof MockAdapter>[0] = [textResponse('first answer'), textResponse('second answer')]) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter(script)
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const remote = await createSessionTestRemote(ctx, {
    defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }),
    cwd: '/workspace',
  })
  const agent = await ctx.agentLoop.create(brandString<SessionId>('retract-session'), { provider: 'mock', model: 'mock' })
  return { ctx, remote, agent, adapter }
}

/**
 * Read the human prompt event sequences in log order.
 * @param agent - live Agent.
 * @returns user-message event sequences.
 */
function humanSeqs(agent: Awaited<ReturnType<typeof setup>>['agent']): number[] {
  return agent.session.snapshotEvents()
    .filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
    .map(event => event.seq)
}

it('shadows the target user message and every later model-visible node', async () => {
  const { remote, agent } = await setup()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const [first, second] = humanSeqs(agent)
  expect(first).toBeDefined()
  expect(second).toBeDefined()
  expect(agent.session.deriveMessages().map(message => message.role)).toEqual([
    'system', 'user', 'assistant', 'user', 'assistant',
  ])

  const result = await remote.retract({ sessionId: agent.id, targetSeq: second!, reason: 'edit' })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value).toMatchObject({ targetSeq: second, fromTurn: 2, toTurn: 2 })
  expect(result.value.shadowedSeqs).toContain(second)

  expect(agent.session.deriveMessages().map(message => message.role)).toEqual(['system', 'user', 'assistant'])
  const events = agent.session.snapshotEvents()
  expect(events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(2)
  const tombstone = events.findLast(event => event.type === 'session/retract')
  expect(tombstone?.data).toMatchObject({ targetSeq: second, fromTurn: 2, toTurn: 2, reason: 'edit' })
  const replacement = events.findLast(event => event.type === 'developer/message' && event.surfaceOp !== 'append')
  expect(replacement?.type).toBe('developer/message')
  if (replacement?.type === 'developer/message') {
    expect(replacement.data.message).toMatchObject({ content: [], source: { kind: 'retraction' } })
  }

  const again = await remote.retract({ sessionId: agent.id, targetSeq: second!, reason: 'retract' })
  expect(again.ok).toBe(false)
  if (!again.ok) expect(again.error.code).toBe('session/retract-unavailable')
})

it('retracts an older turn through the tail and rejects non-user targets', async () => {
  const { remote, agent } = await setup()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const [first] = humanSeqs(agent)
  expect(first).toBeDefined()
  const assistant = agent.session.snapshotEvents().find(event => event.type === 'assistant/message')
  expect(assistant).toBeDefined()
  expect((await remote.retract({ sessionId: agent.id, targetSeq: assistant!.seq, reason: 'retract' })).ok).toBe(false)
  expect((await remote.retract({ sessionId: agent.id, targetSeq: 9999, reason: 'retract' })).ok).toBe(false)

  const result = await remote.retract({ sessionId: agent.id, targetSeq: first!, reason: 'retract' })
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.value).toMatchObject({ fromTurn: 1, toTurn: 2 })
  expect(agent.session.deriveMessages().map(message => message.role)).toEqual(['system'])
})

it('rejects a running turn and pending queue input', async () => {
  const { remote, agent, adapter } = await setup(['hang'])
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } }))
  await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
  const [first] = humanSeqs(agent)
  expect(first).toBeDefined()
  const busy = await remote.retract({ sessionId: agent.id, targetSeq: first!, reason: 'retract' })
  expect(busy.ok).toBe(false)
  if (!busy.ok) expect(busy.error).toMatchObject({ code: 'session/agent-busy' })
  agent.cancel({ kind: 'user' })
  await agent.whenIdle()

  const pending = createUserMessage({ content: [{ type: 'text', text: 'queued' }], source: { kind: 'user' } })
  agent.inbox.append('next-turn', pending)
  const queued = await remote.retract({ sessionId: agent.id, targetSeq: first!, reason: 'retract' })
  expect(queued.ok).toBe(false)
  if (!queued.ok) expect(queued.error).toMatchObject({ code: 'session/agent-busy' })
  agent.inbox.clear()
})
