import { DiplomaticProposalStatus } from './types.js'
import type {
  GameState,
  DiplomaticProposal,
  NonAggressionPact,
  Resources,
  ResourceTradeTerms,
} from './types.js'
import { hexKey } from './map.js'

export type DiplomacyResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string; state: GameState }

// ─── Contact detection ────────────────────────────────────────────────────────

/**
 * Two players have "made contact" when at least one of them has explored a hex
 * where the other currently has a unit or city. Symmetric.
 *
 * V1 rule: we check CURRENT positions against EVER-EXPLORED hexes. A player
 * who scouted an enemy hex and whose enemy later left it may lose the contact
 * flag — accepted trade-off for V1 simplicity.
 */
export function haveMadeContact(
  state: GameState,
  playerAId: string,
  playerBId: string,
): boolean {
  const fogA = state.fogOfWar.find(f => f.playerId === playerAId)
  const fogB = state.fogOfWar.find(f => f.playerId === playerBId)

  const exploredA = fogA ? new Set(fogA.exploredHexes.map(hexKey)) : null
  const exploredB = fogB ? new Set(fogB.exploredHexes.map(hexKey)) : null

  if (!exploredA && !exploredB) return false

  for (const unit of state.units) {
    const key = hexKey(unit.position)
    if (unit.ownerId === playerBId && exploredA?.has(key)) return true
    if (unit.ownerId === playerAId && exploredB?.has(key)) return true
  }
  for (const city of state.cities) {
    const key = hexKey(city.position)
    if (city.ownerId === playerBId && exploredA?.has(key)) return true
    if (city.ownerId === playerAId && exploredB?.has(key)) return true
  }
  return false
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function isActive(state: GameState, playerId: string): boolean {
  const p = state.players.find(pl => pl.id === playerId)
  return !!p && !p.isEliminated
}

function hasExistingPact(state: GameState, aId: string, bId: string): boolean {
  return state.nonAggressionPacts.some(
    p =>
      (p.proposerId === aId && p.acceptorId === bId) ||
      (p.proposerId === bId && p.acceptorId === aId),
  )
}

function hasPendingNap(state: GameState, aId: string, bId: string): boolean {
  return state.diplomaticProposals.some(
    p =>
      p.status === DiplomaticProposalStatus.Pending &&
      p.terms === undefined &&
      ((p.proposerId === aId && p.targetId === bId) ||
        (p.proposerId === bId && p.targetId === aId)),
  )
}

// ─── Non-aggression pact ─────────────────────────────────────────────────────

export function proposeNonAggressionPact(
  state: GameState,
  proposerId: string,
  targetId: string,
): DiplomacyResult {
  if (!isActive(state, proposerId)) {
    return { ok: false, reason: 'proposer is not an active player', state }
  }
  if (!isActive(state, targetId)) {
    return { ok: false, reason: 'target is not an active player', state }
  }
  if (!haveMadeContact(state, proposerId, targetId)) {
    return { ok: false, reason: 'no contact established between players', state }
  }
  if (hasExistingPact(state, proposerId, targetId)) {
    return { ok: false, reason: 'non-aggression pact already exists', state }
  }
  if (hasPendingNap(state, proposerId, targetId)) {
    return { ok: false, reason: 'a pending non-aggression pact proposal already exists', state }
  }

  const proposal: DiplomaticProposal = {
    id: `nap:${proposerId}:${targetId}:${state.turnNumber}`,
    proposerId,
    targetId,
    status: DiplomaticProposalStatus.Pending,
    createdAtTurn: state.turnNumber,
  }

  return {
    ok: true,
    state: { ...state, diplomaticProposals: [...state.diplomaticProposals, proposal] },
  }
}

export function respondToNonAggressionPact(
  state: GameState,
  responderId: string,
  proposalId: string,
  accept: boolean,
): DiplomacyResult {
  const proposal = state.diplomaticProposals.find(p => p.id === proposalId)
  if (!proposal) return { ok: false, reason: 'proposal not found', state }
  if (proposal.terms !== undefined) {
    return { ok: false, reason: 'proposal is not a non-aggression pact', state }
  }
  if (proposal.status !== DiplomaticProposalStatus.Pending) {
    return { ok: false, reason: 'proposal already resolved', state }
  }
  if (proposal.targetId !== responderId) {
    return { ok: false, reason: 'only the proposal target can respond', state }
  }

  const updatedProposals = state.diplomaticProposals.map(p =>
    p.id === proposalId
      ? { ...p, status: accept ? DiplomaticProposalStatus.Accepted : DiplomaticProposalStatus.Rejected }
      : p,
  )

  if (!accept) {
    return { ok: true, state: { ...state, diplomaticProposals: updatedProposals } }
  }

  const pact: NonAggressionPact = {
    id: `pact:${proposal.proposerId}:${responderId}:${state.turnNumber}`,
    proposerId: proposal.proposerId,
    acceptorId: responderId,
    agreedAtTurn: state.turnNumber,
  }

  return {
    ok: true,
    state: {
      ...state,
      diplomaticProposals: updatedProposals,
      nonAggressionPacts: [...state.nonAggressionPacts, pact],
    },
  }
}

// ─── Resource trade ───────────────────────────────────────────────────────────

function sufficient(have: Resources, need: Resources): boolean {
  return have.gold >= need.gold && have.food >= need.food && have.production >= need.production
}

function subtract(a: Resources, b: Resources): Resources {
  return { gold: a.gold - b.gold, food: a.food - b.food, production: a.production - b.production }
}

function add(a: Resources, b: Resources): Resources {
  return { gold: a.gold + b.gold, food: a.food + b.food, production: a.production + b.production }
}

function isNonTrivialTrade(terms: ResourceTradeTerms): boolean {
  return (
    terms.offer.gold > 0 || terms.offer.food > 0 || terms.offer.production > 0 ||
    terms.request.gold > 0 || terms.request.food > 0 || terms.request.production > 0
  )
}

export function proposeResourceTrade(
  state: GameState,
  proposerId: string,
  targetId: string,
  terms: ResourceTradeTerms,
): DiplomacyResult {
  if (!isActive(state, proposerId)) {
    return { ok: false, reason: 'proposer is not an active player', state }
  }
  if (!isActive(state, targetId)) {
    return { ok: false, reason: 'target is not an active player', state }
  }
  if (!haveMadeContact(state, proposerId, targetId)) {
    return { ok: false, reason: 'no contact established between players', state }
  }
  if (!isNonTrivialTrade(terms)) {
    return { ok: false, reason: 'trade must include at least one resource', state }
  }

  const proposer = state.players.find(p => p.id === proposerId)!
  if (!sufficient(proposer.resources, terms.offer)) {
    return { ok: false, reason: 'proposer lacks resources for this offer', state }
  }

  const proposal: DiplomaticProposal = {
    id: `trade:${proposerId}:${targetId}:${state.turnNumber}`,
    proposerId,
    targetId,
    status: DiplomaticProposalStatus.Pending,
    createdAtTurn: state.turnNumber,
    terms,
  }

  return {
    ok: true,
    state: { ...state, diplomaticProposals: [...state.diplomaticProposals, proposal] },
  }
}

export function respondToResourceTrade(
  state: GameState,
  responderId: string,
  proposalId: string,
  accept: boolean,
): DiplomacyResult {
  const proposal = state.diplomaticProposals.find(p => p.id === proposalId)
  if (!proposal) return { ok: false, reason: 'proposal not found', state }
  if (!proposal.terms) return { ok: false, reason: 'proposal is not a resource trade', state }
  if (proposal.status !== DiplomaticProposalStatus.Pending) {
    return { ok: false, reason: 'proposal already resolved', state }
  }
  if (proposal.targetId !== responderId) {
    return { ok: false, reason: 'only the proposal target can respond', state }
  }

  const updatedProposals = state.diplomaticProposals.map(p =>
    p.id === proposalId
      ? { ...p, status: accept ? DiplomaticProposalStatus.Accepted : DiplomaticProposalStatus.Rejected }
      : p,
  )

  if (!accept) {
    return { ok: true, state: { ...state, diplomaticProposals: updatedProposals } }
  }

  const proposer = state.players.find(p => p.id === proposal.proposerId)!
  const target = state.players.find(p => p.id === responderId)!

  if (!sufficient(proposer.resources, proposal.terms.offer)) {
    return { ok: false, reason: 'proposer no longer has enough resources', state }
  }
  if (!sufficient(target.resources, proposal.terms.request)) {
    return { ok: false, reason: 'target lacks resources for this trade', state }
  }

  const terms = proposal.terms
  const updatedPlayers = state.players.map(p => {
    if (p.id === proposal.proposerId) {
      return { ...p, resources: add(subtract(p.resources, terms.offer), terms.request) }
    }
    if (p.id === responderId) {
      return { ...p, resources: add(subtract(p.resources, terms.request), terms.offer) }
    }
    return p
  })

  return {
    ok: true,
    state: {
      ...state,
      players: updatedPlayers,
      diplomaticProposals: updatedProposals,
    },
  }
}
