import { expect, it } from 'vitest'
import { apply } from '../src/index.ts'

it('contributes nothing on the Host', () => {
  expect(apply()).toBeUndefined()
})
