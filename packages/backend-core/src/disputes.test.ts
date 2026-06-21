import { describe, it, expect } from 'vitest'
import { diffDisputes } from './disputes.js'
import { CombatDisputeStatus, type CombatDispute } from '@aetas/game-engine'

type Status = 'pending' | 'resolvedByAction' | 'resolvedByTimeout'
const STATUS: Record<Status, CombatDisputeStatus> = {
  pending: CombatDisputeStatus.Pending,
  resolvedByAction: CombatDisputeStatus.ResolvedByAction,
  resolvedByTimeout: CombatDisputeStatus.ResolvedByTimeout,
}

function dispute(id: string, status: Status): CombatDispute {
  return {
    id,
    attackerUnitId: `${id}-a`,
    defenderUnitId: `${id}-d`,
    attackerPlayerId: 'p0',
    defenderPlayerId: 'p1',
    createdAt: 0,
    expiresAt: 1000,
    status: STATUS[status],
  }
}

describe('diffDisputes', () => {
  it('reports a brand-new pending dispute as an insert', () => {
    const diff = diffDisputes([], [dispute('d1', 'pending')], 'g1')
    expect(diff.inserts).toHaveLength(1)
    expect(diff.inserts[0]).toMatchObject({ id: 'd1', gameId: 'g1', status: 'pending' })
    expect(diff.statusUpdates).toHaveLength(0)
  })

  it('reports a status change on an existing dispute as a status update', () => {
    const pre = [dispute('d1', 'pending')]
    const post = [dispute('d1', 'resolvedByAction')]
    const diff = diffDisputes(pre, post, 'g1')
    expect(diff.inserts).toHaveLength(0)
    expect(diff.statusUpdates).toEqual([{ id: 'd1', status: 'resolvedByAction' }])
  })

  it('reports nothing when a dispute is unchanged', () => {
    const same = [dispute('d1', 'pending')]
    const diff = diffDisputes(same, [dispute('d1', 'pending')], 'g1')
    expect(diff.inserts).toHaveLength(0)
    expect(diff.statusUpdates).toHaveLength(0)
  })

  it('created-and-resolved in the same turn → single insert at final status, no update', () => {
    // initiateCombat opened d1 earlier this turn; the same endTurn timed it out.
    // From the persistence layer's view the row is born already resolved.
    const diff = diffDisputes([], [dispute('d1', 'resolvedByTimeout')], 'g1')
    expect(diff.inserts).toHaveLength(1)
    expect(diff.inserts[0]!.status).toBe('resolvedByTimeout')
    expect(diff.statusUpdates).toHaveLength(0)
  })

  it('handles a mix of insert + update in one diff', () => {
    const pre = [dispute('d1', 'pending')]
    const post = [dispute('d1', 'resolvedByAction'), dispute('d2', 'pending')]
    const diff = diffDisputes(pre, post, 'g1')
    expect(diff.inserts.map(i => i.id)).toEqual(['d2'])
    expect(diff.statusUpdates).toEqual([{ id: 'd1', status: 'resolvedByAction' }])
  })

  it('carries the dispute identity fields into the row', () => {
    const d = dispute('d1', 'pending')
    const diff = diffDisputes([], [d], 'game-xyz')
    expect(diff.inserts[0]).toEqual({
      id: 'd1',
      gameId: 'game-xyz',
      attackerPlayerId: 'p0',
      defenderPlayerId: 'p1',
      status: 'pending',
      expiresAt: 1000,
    })
  })
})
