import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameState, HexCoord, CitySpecialization, Unit, Resources } from '@aetas/game-engine'
import { Era, BuildingType, UnitType, CIVILIZATIONS, UNIT_CATALOG, SPECIAL_UNIT_CATALOG, BUILDING_CATALOG, CombatDisputeStatus, relationBetween, xpToLevel, computeCityProduction, rankPlayers, getWonderDef, GOLDEN_AGE_DURATION } from '@aetas/game-engine'
import { supabase } from '../supabase.ts'
import { submitAction, resolveDispute, awardXp, awardActionXp } from '../api.ts'
import HexMap from '../components/HexMap.tsx'
import ActionSheet from '../components/ActionSheet.tsx'
import { RESOURCE_ICONS } from '../components/ui/ResourceChip'
import CityModal from '../components/CityModal.tsx'
import FoundCityModal from '../components/FoundCityModal.tsx'
import CombatPreviewModal from '../components/CombatPreviewModal.tsx'
import TradeModal from '../components/TradeModal.tsx'
import DeclareWarModal from '../components/DeclareWarModal.tsx'
import GameOverScreen from '../components/GameOverScreen.tsx'
import ScoreModal from '../components/ScoreModal.tsx'
import EraModal, { ERA_ICONS } from '../components/EraModal.tsx'
import XpToast, { type XpToastItem } from '../components/XpToast.tsx'
import EventToast, { type EventToastItem } from '../components/EventToast.tsx'
import LevelUpModal from '../components/LevelUpModal.tsx'
import TutorialOverlay from '../components/TutorialOverlay.tsx'
import i18n from '../i18n.ts'

interface Props {
  gameId: string
  userId: string
  onBack: () => void
}

const ERA_NAME_KEY: Record<Era, 'era.ancient' | 'era.classical' | 'era.medieval'> = {
  [Era.Ancient]:   'era.ancient',
  [Era.Classical]: 'era.classical',
  [Era.Medieval]:  'era.medieval',
}

/** Frosted-glass surface for the floating in-game HUD (spec-2 §A). */
const GLASS: CSSProperties = {
  background: 'rgba(13,10,5,0.6)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(201,169,78,0.18)',
}

function civName(players: GameState['players'] | null | undefined, playerId: string): string {
  if (!players) return playerId.slice(0, 6)
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? playerId.slice(0, 6)
}

function unitLabel(unitType: string): string {
  const def = UNIT_CATALOG.get(unitType as UnitType) ?? SPECIAL_UNIT_CATALOG.get(unitType)
  return def?.name ?? unitType
}

function buildingLabel(buildingType: BuildingType): string {
  return BUILDING_CATALOG.get(buildingType)?.name ?? buildingType
}

function formatDisputeResolutionLog(pre: GameState, post: GameState, atk: Unit, def: Unit): string {
  const atkName = unitLabel(atk.unitType)
  const defName = unitLabel(def.unitType)
  const defCiv  = civName(pre.players, def.ownerId)
  const atkPostHp = post.units.find(u => u.id === atk.id)?.stats.hp
  const defPostHp = post.units.find(u => u.id === def.id)?.stats.hp
  const atkDestroyed = atkPostHp === undefined
  const defDestroyed = defPostHp === undefined
  const dmgToDef = defDestroyed ? def.stats.hp : def.stats.hp - (defPostHp ?? def.stats.hp)
  const dmgToAtk = atkDestroyed ? atk.stats.hp : atk.stats.hp - (atkPostHp ?? atk.stats.hp)
  if (defDestroyed)
    return dmgToAtk > 0
      ? i18n.t('combat.won', { atk: atkName, def: defName, civ: defCiv, dmg: dmgToDef, lost: dmgToAtk })
      : i18n.t('combat.wonSimple', { atk: atkName, def: defName, civ: defCiv, dmg: dmgToDef })
  if (atkDestroyed)
    return i18n.t('combat.lost', { atk: atkName, def: defName, civ: defCiv, hp: defPostHp })
  return i18n.t('combat.draw', { atk: atkName, def: defName, civ: defCiv, dmgToDef, dmgToAtk })
}

function formatCityAttackLog(pre: GameState, post: GameState | null, unitId: string, cityId: string): string {
  const unit = pre.units.find(u => u.id === unitId)
  const city = pre.cities.find(c => c.id === cityId)
  if (!unit || !city) return i18n.t('game.cityAttackDone')
  const postCity = post?.cities.find(c => c.id === cityId)
  const captured = postCity && postCity.ownerId !== city.ownerId
  const name = unitLabel(unit.unitType)
  if (captured) return i18n.t('combat.cityCapture', { unit: name, city: city.name })
  const dmg = (city.hp ?? 10) - (postCity?.hp ?? city.hp ?? 10)
  return i18n.t('combat.cityAttack', { unit: name, city: city.name, dmg, hp: postCity?.hp ?? '?', maxHp: city.maxHp ?? 10 })
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

function diffDiplomacyForLog(pre: GameState, post: GameState): string[] {
  const logs: string[] = []
  const name = (id: string) => civName(post.players, id)

  const preWars  = new Set((pre.wars ?? []).map(w => pairKey(w.declarerId, w.targetId)))
  const postWars = new Set((post.wars ?? []).map(w => pairKey(w.declarerId, w.targetId)))
  const prePacts  = new Set(pre.nonAggressionPacts.map(p => pairKey(p.proposerId, p.acceptorId)))
  const postPacts = new Set(post.nonAggressionPacts.map(p => pairKey(p.proposerId, p.acceptorId)))

  for (const w of post.wars ?? []) {
    if (!preWars.has(pairKey(w.declarerId, w.targetId))) {
      logs.push(i18n.t('diplo.logWarDeclared', { attacker: name(w.declarerId), target: name(w.targetId) }))
    }
  }
  for (const k of preWars) {
    if (!postWars.has(k)) {
      const [a, b] = k.split('|')
      logs.push(i18n.t('diplo.logPeaceMade', { p1: name(a), p2: name(b) }))
    }
  }
  for (const p of post.nonAggressionPacts) {
    if (!prePacts.has(pairKey(p.proposerId, p.acceptorId))) {
      logs.push(i18n.t('diplo.logPactMade', { p1: name(p.proposerId), p2: name(p.acceptorId) }))
    }
  }
  for (const k of prePacts) {
    if (!postPacts.has(k) && !postWars.has(k)) {
      const [a, b] = k.split('|')
      logs.push(i18n.t('diplo.logPactBroken', { p1: name(a), p2: name(b) }))
    }
  }
  const preResolved = new Set(pre.diplomaticProposals.filter(p => p.status !== 'pending').map(p => p.id))
  for (const p of post.diplomaticProposals) {
    if (preResolved.has(p.id) || p.status === 'pending') continue
    const kind = p.kind ?? (p.terms ? 'trade' : 'pact')
    if (p.status === 'accepted') {
      if (kind === 'trade') logs.push(i18n.t('diplo.logTradeAccepted', { p1: name(p.proposerId), p2: name(p.targetId) }))
    } else if (p.status === 'rejected') {
      const key = kind === 'trade' ? 'diplo.logRejectedTrade' : kind === 'peace' ? 'diplo.logRejectedPeace' : 'diplo.logRejectedPact'
      logs.push(i18n.t(key, { player: name(p.targetId), from: name(p.proposerId) }))
    }
  }
  for (const p of post.players) {
    const prev = pre.players.find(pl => pl.id === p.id)
    if (!prev?.isEliminated && p.isEliminated) {
      logs.push(i18n.t('diplo.logEliminated', { player: name(p.id) }))
    }
  }
  return logs
}

const ERROR_KEY_MAP: Record<string, string> = {
  'unit has already attacked this turn': 'error.unitAlreadyAttacked',
  'unit has already moved this turn': 'error.unitAlreadyMoved',
  'city hex occupied': 'error.cityHexOccupied',
  'insufficient production': 'error.insufficientProduction',
  'target is not adjacent': 'error.targetNotAdjacent',
  'cannot move to water': 'error.cannotMoveToWater',
  'target hex is occupied': 'error.targetHexOccupied',
  'target out of movement range': 'error.targetOutOfRange',
  'unit is not yours': 'error.unitNotYours',
  'unit is already there': 'error.unitAlreadyThere',
  'not your city': 'error.notYourCity',
  'city not found': 'error.cityNotFound',
  'unit not found': 'error.unitNotFound',
  'dispute already resolved': 'error.disputeAlreadyResolved',
  'unit not available in this era': 'error.unitNotAvailable',
  'building already constructed': 'error.buildingAlreadyConstructed',
  'construction already in progress': 'error.constructionInProgress',
  'unit cannot found a city': 'error.unitCannotFoundCity',
  'cannot found a city on water': 'error.cannotFoundOnWater',
  'too close to an existing city': 'error.tooClose',
  'cannot attack your own city': 'error.cannotAttackOwnCity',
  'city is not adjacent': 'error.cityNotAdjacent',
  'non-aggression pact prevents this attack': 'error.pactPreventsAttack',
  'no contact established between players': 'error.noContact',
  'non-aggression pact already exists': 'error.pactAlreadyExists',
  'a pending non-aggression pact proposal already exists': 'error.pendingPactProposal',
  'proposer lacks resources for this offer': 'error.insufficientResources',
  'proposer no longer has enough resources': 'error.insufficientResourcesComplete',
  'target lacks resources for this trade': 'error.targetInsufficientResources',
  'trade must include at least one resource': 'error.tradeMustInclude',
  'players are not at war': 'error.notAtWar',
  'already at war': 'error.alreadyAtWar',
  'no non-aggression pact to break': 'error.noPactToBreak',
  'a pending peace proposal already exists': 'error.pendingPeaceProposal',
  'proposal not found': 'error.proposalNotFound',
  'only the proposal target can respond': 'error.onlyTargetCanRespond',
  'proposal already resolved': 'error.proposalAlreadyResolved',
}

function errorLabel(err?: string | null): string {
  if (!err) return i18n.t('error.unknown')
  const key = ERROR_KEY_MAP[err]
  return key ? i18n.t(key) : err
}

export default function GameView({ gameId, userId, onBack }: Props) {
  const { t } = useTranslation()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [enginePlayerId, setEnginePlayerId] = useState<string>(userId)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const [showGameOver, setShowGameOver] = useState(false)
  const [xpGain, setXpGain] = useState<{ gained: number; newXp: number } | null>(null)
  const [godMode, setGodMode] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [foundingUnitId, setFoundingUnitId] = useState<string | null>(null)
  const [foundCityLoading, setFoundCityLoading] = useState(false)
  const [combatPreview, setCombatPreview] = useState<{ attackerId: string; defenderId: string } | null>(null)
  const [combatLoading, setCombatLoading] = useState(false)
  const [eraModal, setEraModal] = useState<{ era: Era; prevEra: Era } | null>(null)
  const [tradeTarget, setTradeTarget] = useState<string | null>(null)
  const [warTarget, setWarTarget] = useState<string | null>(null)
  const [diplomacyLoading, setDiplomacyLoading] = useState(false)
  const [diplomacyOpenSignal, setDiplomacyOpenSignal] = useState(0)
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [newUnitIds, setNewUnitIds] = useState<Set<string>>(new Set())
  const [xpToasts, setXpToasts] = useState<XpToastItem[]>([])
  const [eventToasts, setEventToasts] = useState<EventToastItem[]>([])
  const [levelUpData, setLevelUpData] = useState<number | null>(null)
  const [tutorialStep, setTutorialStep] = useState<number>(() =>
    localStorage.getItem('aetas-tutorial-done') ? -1 : 0
  )

  const gameStateRef    = useRef<GameState | null>(null)
  const prevEraRef      = useRef<Era | null>(null)
  const knownUnitIdsRef = useRef<Set<string>>(new Set())
  const seenEventKeysRef = useRef<Set<string>>(new Set())
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

  // Detect era advancement to show the celebration modal
  useEffect(() => {
    if (!gameState) return
    const cur = gameState.era
    if (prevEraRef.current !== null && prevEraRef.current !== cur) {
      setEraModal({ era: cur, prevEra: prevEraRef.current })
    }
    prevEraRef.current = cur
  }, [gameState?.era])

  const addLog = (msg: string) => {
    const ts = new Date().toISOString().slice(11, 19)
    setLog(l => [`${ts} ${msg}`, ...l].slice(0, 40))
  }

  // World events (ENT-6): surface the last round's deterministic events as a log
  // line + a floating toast. Dedup by key so refetch/realtime never double-fires.
  useEffect(() => {
    const events = gameState?.lastEvents
    if (!events || events.length === 0) return
    for (const ev of events) {
      const key = `${ev.round}:${ev.type}:${ev.cityId ?? ''}`
      if (seenEventKeysRef.current.has(key)) continue
      seenEventKeysRef.current.add(key)
      const label = i18n.t(`event.${ev.type}`, { city: ev.cityName ?? '', turns: GOLDEN_AGE_DURATION })
      addLog(label)
      const toastId = crypto.randomUUID()
      setEventToasts(ts => [...ts, { id: toastId, type: ev.type, city: ev.cityName, turns: GOLDEN_AGE_DURATION }])
      setTimeout(() => setEventToasts(ts => ts.filter(t => t.id !== toastId)), 4000)
    }
  }, [gameState?.lastEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  const skipTutorial = () => {
    localStorage.setItem('aetas-tutorial-done', '1')
    setTutorialStep(-1)
  }

  // Step 0 → 1: advance when player selects a unit
  useEffect(() => {
    if (tutorialStep === 0 && selectedUnitId) setTutorialStep(1)
  }, [selectedUnitId, tutorialStep])

  // Step 2 → 3: advance when player opens a city (or auto-skip if no cities)
  useEffect(() => {
    if (tutorialStep === 2 && selectedCityId) setTutorialStep(3)
  }, [selectedCityId, tutorialStep])

  useEffect(() => {
    if (tutorialStep === 2 && gameState) {
      const hasCities = gameState.cities.some(c => c.ownerId === enginePlayerId)
      if (!hasCities) setTutorialStep(3)
    }
  }, [tutorialStep, gameState, enginePlayerId])

  const triggerXp = useCallback(async (event: string, actionId: string, amount: number) => {
    const res = await awardActionXp(event, actionId, amount)
    if (!res.ok || !res.data || res.data.alreadyAwarded || res.data.xpGained === 0) return
    const { xpGained, newXp } = res.data
    const toastId = crypto.randomUUID()
    setXpToasts(ts => [...ts, { id: toastId, event, xpGained }])
    setTimeout(() => setXpToasts(ts => ts.filter(t => t.id !== toastId)), 2600)
    const prevLevel = xpToLevel(newXp - xpGained)
    const newLevel  = xpToLevel(newXp)
    if (newLevel > prevLevel) setLevelUpData(newLevel)
  }, [])

  const fetchGame = useCallback(async (): Promise<GameState | null> => {
    const { data, error: err } = await supabase
      .from('games')
      .select('game_state, turn_number, current_player_id, is_finished, winner_id')
      .eq('id', gameId)
      .single()
    if (err) { setError(err.message); return null }
    const gs = data.game_state as GameState
    setGameState(gs)
    setLoading(false)
    const currentIds = new Set(gs.units.map(u => u.id))
    const appeared = new Set([...currentIds].filter(id => !knownUnitIdsRef.current.has(id)))
    if (appeared.size > 0) {
      setNewUnitIds(appeared)
      setTimeout(() => setNewUnitIds(new Set()), 500)
    }
    knownUnitIdsRef.current = currentIds
    return gs
  }, [gameId])

  useEffect(() => {
    supabase
      .from('game_players')
      .select('engine_player_id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (data?.engine_player_id) setEnginePlayerId(data.engine_player_id as string)
      })
  }, [gameId, userId])

  useEffect(() => { void fetchGame() }, [fetchGame])

  useEffect(() => {
    void supabase.realtime.setAuth()
    const channel = supabase
      .channel(`game:${gameId}`, { config: { private: true } })
      .on('broadcast', { event: 'turn_changed' }, (msg) => {
        const p = msg.payload as { currentPlayerId: string; turnNumber: number }
        const preState = gameStateRef.current
        const isMe = p.currentPlayerId === enginePlayerId
        const name = civName(preState?.players, p.currentPlayerId)
        addLog(isMe
          ? i18n.t('log.turnYours', { n: p.turnNumber })
          : i18n.t('log.turnTheirs', { n: p.turnNumber, player: name }))
        void fetchGame().then(postState => {
          if (preState && postState) {
            for (const line of diffDiplomacyForLog(preState, postState)) addLog(line)
          }
        })
      })
      .on('broadcast', { event: 'dispute_resolved' }, () => {
        const preState = gameStateRef.current
        void fetchGame().then(postState => {
          if (preState && postState) {
            const resolved = preState.combatDisputes.find(
              d => d.status === CombatDisputeStatus.Pending &&
                   !postState.combatDisputes.some(pd => pd.id === d.id && pd.status === CombatDisputeStatus.Pending),
            )
            if (resolved) {
              const atk = preState.units.find(u => u.id === resolved.attackerUnitId)
              const def = preState.units.find(u => u.id === resolved.defenderUnitId)
              if (atk && def) addLog(formatDisputeResolutionLog(preState, postState, atk, def))
              else addLog(i18n.t('combat.resolvedCheckLog'))
            } else {
              addLog(i18n.t('combat.resolved'))
            }
          }
        })
      })
      .on('broadcast', { event: 'game_over' }, (msg) => {
        const p = msg.payload as { winnerId: string | null }
        const players = gameStateRef.current?.players
        addLog(p.winnerId
          ? i18n.t('game.finished', { winner: civName(players, p.winnerId) })
          : i18n.t('game.draw'))
        void fetchGame()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [gameId, fetchGame])

  useEffect(() => {
    if (gameState?.isFinished) {
      setShowGameOver(true)
      void awardXp(gameId).then(res => {
        if (res.ok && res.data && !res.data.alreadyAwarded) {
          setXpGain({ gained: res.data.xpGained, newXp: res.data.newXp })
        }
      })
    }
  }, [gameState?.isFinished, gameId])

  const isMyTurn = !!gameState && gameState.currentPlayerId === enginePlayerId && !gameState.isFinished

  const myPlayer = gameState?.players.find(p => p.id === enginePlayerId)

  const myRank = useMemo(() => {
    if (!gameState) return null
    const ranked = rankPlayers(gameState)
    const idx = ranked.findIndex(s => s.playerId === enginePlayerId)
    return idx === -1 ? null : { position: idx + 1, total: ranked.length }
  }, [gameState, enginePlayerId])

  const myIncome = useMemo((): Resources => {
    if (!gameState) return { gold: 0, food: 0, production: 0 }
    const myCities = gameState.cities.filter(c => c.ownerId === enginePlayerId)
    return myCities.reduce(
      (acc, city) => {
        const p = computeCityProduction(city, gameState.cities, gameState.map.tiles)
        return { gold: acc.gold + p.gold, food: acc.food + p.food, production: acc.production + p.production }
      },
      { gold: 0, food: 0, production: 0 },
    )
  }, [gameState, enginePlayerId])

  const applyOrFetch = useCallback((state?: GameState | null) => {
    if (state) setGameState(state)
    else void fetchGame()
  }, [fetchGame])

  const handleEndTurn = async () => {
    const preState = gameState!
    const res = await submitAction(gameId, { type: 'endTurn' })
    addLog(res.ok ? i18n.t('action.turnEnded') : `✗ ${errorLabel(res.error)}`)
    if (res.ok) {
      if (tutorialStep === 3) skipTutorial()
      setSelectedUnitId(null)
      let postState = res.data?.state ?? null
      if (postState) setGameState(postState)
      else postState = await fetchGame()
      void triggerXp('turn_played', `${gameId}:turn:${preState.turnNumber}:${enginePlayerId}`, 5)
      if (postState) {
        if (preState.era !== postState.era) {
          void triggerXp('era_advanced', `${gameId}:era:${postState.era}:${enginePlayerId}`, 20)
        }
        for (const postCity of postState.cities.filter(c => c.ownerId === enginePlayerId)) {
          const preCity = preState.cities.find(c => c.id === postCity.id)
          if (!preCity) continue
          const preBuilt = new Set(preCity.buildings ?? [])
          for (const b of postCity.buildings ?? []) {
            if (!preBuilt.has(b)) {
              void triggerXp('building_constructed', `${gameId}:building:${postCity.id}:${b}`, 5)
            }
          }
        }
        for (const postPlayer of postState.players) {
          const prePlayer = preState.players.find(p => p.id === postPlayer.id)
          if (postPlayer.isEliminated && !prePlayer?.isEliminated) {
            void triggerXp('civ_eliminated', `${gameId}:elim:${postPlayer.id}:${enginePlayerId}`, 15)
          }
        }
      }
    }
  }

  const handleInitiateCombat = (attackerUnitId: string, defenderUnitId: string) => {
    setCombatPreview({ attackerId: attackerUnitId, defenderId: defenderUnitId })
  }

  const handleConfirmAttack = async (attackerUnitId: string, defenderUnitId: string) => {
    const preState = gameState!
    const preAtk = preState.units.find(u => u.id === attackerUnitId)
    const preDef = preState.units.find(u => u.id === defenderUnitId)
    setCombatLoading(true)
    const res = await submitAction(gameId, { type: 'initiateCombat', attackerUnitId, defenderUnitId })
    setCombatLoading(false)
    if (!res.ok) { addLog(`✗ ${errorLabel(res.error)}`); return }

    const post = res.data?.state
    // Attacking an AI opponent resolves on the spot (no pending dispute); a human
    // defender opens an async dispute instead. Log the actual outcome accordingly.
    const stillPending = !!post?.combatDisputes.some(
      d => d.attackerUnitId === attackerUnitId && d.status === CombatDisputeStatus.Pending,
    )
    if (post && preAtk && preDef && !stillPending) {
      addLog(formatDisputeResolutionLog(preState, post, preAtk, preDef))
    } else {
      addLog(i18n.t('combat.initiated'))
    }
    setCombatPreview(null); setSelectedUnitId(null); applyOrFetch(post)
  }

  const handleResolveDispute = async (disputeId: string) => {
    const preState = gameState!
    const dispute = preState.combatDisputes.find(d => d.id === disputeId)
    const preAtk = preState.units.find(u => u.id === dispute?.attackerUnitId)
    const preDef = preState.units.find(u => u.id === dispute?.defenderUnitId)
    const res = await resolveDispute(gameId, disputeId)
    if (res.ok && res.data?.state) {
      const post = res.data.state
      setGameState(post)
      if (preAtk && preDef) addLog(formatDisputeResolutionLog(preState, post, preAtk, preDef))
      else addLog(i18n.t('combat.resolved'))
      if (
        preAtk?.ownerId === enginePlayerId &&
        post.units.some(u => u.id === preAtk?.id) &&
        !post.units.some(u => u.id === preDef?.id)
      ) {
        void triggerXp('combat_won', `${gameId}:combat:${disputeId}`, 6)
      }
    } else {
      addLog(`✗ ${errorLabel(res.error)}`)
      void fetchGame()
    }
  }

  const handleConstructBuilding = async (cityId: string, buildingType: BuildingType) => {
    const res = await submitAction(gameId, { type: 'constructBuilding', cityId, buildingType })
    addLog(res.ok ? i18n.t('city.buildingStarted', { building: buildingLabel(buildingType) }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleBuildWonder = async (cityId: string, wonderId: string) => {
    const res = await submitAction(gameId, { type: 'buildWonder', cityId, wonderId })
    addLog(res.ok ? i18n.t('city.wonders.built', { wonder: getWonderDef(wonderId)?.name }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleFortifyCity = async (cityId: string, goldAmount: number) => {
    const res = await submitAction(gameId, { type: 'fortifyCity', cityId, goldAmount })
    addLog(res.ok ? i18n.t('action.fortified') : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleFortifyUnit = async (unitId: string) => {
    const res = await submitAction(gameId, { type: 'fortifyUnit', unitId })
    addLog(res.ok ? i18n.t('unit.fortify') : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setSelectedUnitId(null); applyOrFetch(res.data?.state) }
  }

  const handleAttackCity = async (unitId: string, cityId: string) => {
    const preState = gameState!
    const res = await submitAction(gameId, { type: 'attackCity', unitId, cityId })
    if (res.ok) {
      const postState = res.data?.state ?? null
      if (postState) setGameState(postState)
      else void fetchGame()
      addLog(formatCityAttackLog(preState, postState, unitId, cityId))
      // Achievement counter: a city I now own that I didn't before = a capture.
      const preCity = preState.cities.find(c => c.id === cityId)
      const postCity = postState?.cities.find(c => c.id === cityId)
      if (preCity && postCity && postCity.ownerId === enginePlayerId && preCity.ownerId !== enginePlayerId) {
        void awardActionXp('city_captured', `${gameId}:capture:${cityId}:${enginePlayerId}`, 0)
      }
      setSelectedUnitId(null)
    } else {
      addLog(`✗ ${errorLabel(res.error)}`)
    }
  }

  const handleMoveUnit = async (unitId: string, targetCoord: HexCoord) => {
    const res = await submitAction(gameId, { type: 'moveUnit', unitId, targetCoord })
    addLog(res.ok ? i18n.t('action.unitMoved') : `✗ ${errorLabel(res.error)}`)
    if (res.ok) {
      if (tutorialStep === 1) setTutorialStep(2)
      setSelectedUnitId(null)
      applyOrFetch(res.data?.state)
    }
  }

  // ─── Diplomacy ──────────────────────────────────────────────────────────────

  const civOf = (id: string) => civName(gameState?.players, id)

  const handleProposePact = async (targetId: string) => {
    const res = await submitAction(gameId, { type: 'proposePact', targetId })
    addLog(res.ok ? i18n.t('diplo.proposePactLog', { civ: civOf(targetId) }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleBreakPact = async (targetId: string) => {
    const res = await submitAction(gameId, { type: 'breakPact', targetId })
    addLog(res.ok ? i18n.t('diplo.breakPactLog', { civ: civOf(targetId) }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleProposePeace = async (targetId: string) => {
    const res = await submitAction(gameId, { type: 'proposePeace', targetId })
    addLog(res.ok ? i18n.t('diplo.proposePeaceLog', { civ: civOf(targetId) }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleDeclareWar = async (targetId: string) => {
    setDiplomacyLoading(true)
    const res = await submitAction(gameId, { type: 'declareWar', targetId })
    setDiplomacyLoading(false)
    addLog(res.ok ? i18n.t('diplo.declareWarLog', { civ: civOf(targetId) }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setWarTarget(null); applyOrFetch(res.data?.state) }
  }

  const handleProposeTrade = async (targetId: string, offer: Resources, request: Resources) => {
    setDiplomacyLoading(true)
    const res = await submitAction(gameId, { type: 'proposeTrade', targetId, offer, request })
    setDiplomacyLoading(false)
    addLog(res.ok ? i18n.t('diplo.proposeTradeLog', { civ: civOf(targetId) }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setTradeTarget(null); applyOrFetch(res.data?.state) }
  }

  // Achievement counter: a non-aggression pact I'm party to that didn't exist
  // before = a pact I just signed. Idempotent action_id (amount 0 → no XP).
  const firePactCounter = (pre: GameState, post: GameState) => {
    const key = (p: { proposerId: string; acceptorId: string }) => [p.proposerId, p.acceptorId].sort().join('-')
    const preKeys = new Set(pre.nonAggressionPacts.map(key))
    for (const p of post.nonAggressionPacts) {
      if ((p.proposerId === enginePlayerId || p.acceptorId === enginePlayerId) && !preKeys.has(key(p))) {
        void awardActionXp('pact_signed', `${gameId}:pact:${key(p)}`, 0)
      }
    }
  }

  const handleRespondDiplomacy = async (proposalId: string, accept: boolean) => {
    const preState = gameState!
    const res = await submitAction(gameId, { type: 'respondToDiplomacy', proposalId, accept })
    if (res.ok) {
      const postState = res.data?.state ?? null
      if (postState) {
        setGameState(postState)
        for (const line of diffDiplomacyForLog(preState, postState)) addLog(line)
        firePactCounter(preState, postState)
      } else {
        const fetched = await fetchGame()
        if (fetched) { for (const line of diffDiplomacyForLog(preState, fetched)) addLog(line); firePactCounter(preState, fetched) }
      }
    } else {
      addLog(`✗ ${errorLabel(res.error)}`)
    }
  }

  const CITY_NAMES = [
    'Roma', 'Atenas', 'Cartago', 'Alexandria', 'Babilônia', 'Nínive', 'Tiro',
    'Esparta', 'Corinto', 'Tebas', 'Mênfis', 'Luxor', 'Petra', 'Samarkanda',
    'Persépolis', 'Susa', 'Jericó', 'Damasco', 'Sidão', 'Ur',
  ]

  const handleFoundCity = async (specialization: CitySpecialization) => {
    if (!foundingUnitId || !gameState) return
    setFoundCityLoading(true)
    const cityId = crypto.randomUUID()
    const usedNames = new Set(gameState.cities.map(c => c.name))
    const cityName = CITY_NAMES.find(n => !usedNames.has(n)) ?? `Cidade ${gameState.cities.length + 1}`
    const res = await submitAction(gameId, { type: 'foundCity', unitId: foundingUnitId, cityId, cityName, specialization })
    setFoundCityLoading(false)
    addLog(res.ok ? i18n.t('city.founded', { name: cityName }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) {
      setFoundingUnitId(null)
      setSelectedUnitId(null)
      applyOrFetch(res.data?.state)
      setSelectedCityId(cityId)
      void triggerXp('city_founded', `${gameId}:city:${cityId}`, 8)
    }
  }

  const handleTrainUnit = async (cityId: string, unitType: string) => {
    const unitId = crypto.randomUUID()
    const res = await submitAction(gameId, { type: 'trainUnit', cityId, unitType, unitId })
    addLog(res.ok ? i18n.t('city.unitTrained', { unit: unitLabel(unitType) }) : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-aetas-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-aetas-border border-t-aetas-muted animate-spin" />
          <p className="text-aetas-dim text-sm">{t('game.loading')}</p>
        </div>
      </div>
    )
  }

  if (error || !gameState) {
    return (
      <div className="min-h-screen bg-aetas-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-3">{error || t('game.errorLoad')}</p>
          <button onClick={onBack} className="text-aetas-muted hover:text-aetas-text text-sm underline">
            {t('ui.back')}
          </button>
        </div>
      </div>
    )
  }

  const isFinished = gameState.isFinished
  const incomingProposals = gameState.diplomaticProposals.filter(
    p => p.status === 'pending' && p.targetId === enginePlayerId,
  ).length

  const myUnitCount = gameState.units.filter(u => u.ownerId === enginePlayerId).length

  return (
    <div className="flex flex-col h-screen bg-aetas-bg text-aetas-text overflow-hidden">
      {/* ── Main area (map fills the screen; HUD floats over it) ── */}
      <div className="flex flex-1 min-h-0">
        {/* Hex map */}
        <div
          className="relative flex-1 min-h-0"
          style={{
            backgroundImage: 'url(/assets/game-bg.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 30%',
          }}
        >
          <div className="absolute inset-0 bg-aetas-bg/60 pointer-events-none" />
          <HexMap
            gameState={gameState}
            myEnginePlayerId={enginePlayerId}
            selectedUnitId={selectedUnitId}
            godMode={godMode}
            onSelectUnit={setSelectedUnitId}
            onInitiateCombat={handleInitiateCombat}
            onCityClick={setSelectedCityId}
            onMoveUnit={(id, coord) => { void handleMoveUnit(id, coord) }}
            newUnitIds={newUnitIds}
          />

          {/* ── Floating glass HUD (over the map — never touches HexMap) ── */}
          <div className="absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-2 pointer-events-none">
            {/* Top bar */}
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="pointer-events-auto w-[34px] h-[34px] flex-shrink-0 flex items-center justify-center rounded-lg text-aetas-gold text-lg hover:brightness-125 transition"
                style={GLASS}
                title={t('game.back')}
              >←</button>

              {/* Turn seal */}
              <div className="flex-1 flex justify-center min-w-0">
                {isFinished ? (
                  <div className="pointer-events-auto px-3 py-1.5 rounded-full font-display text-[11px] font-semibold tracking-wider text-aetas-muted truncate" style={GLASS}>
                    {gameState.winner ? t('game.finished', { winner: civName(gameState.players, gameState.winner) }) : t('game.draw')}
                  </div>
                ) : isMyTurn ? (
                  <div
                    className="pointer-events-auto anim-glowpulse flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{ ...GLASS, border: '1px solid rgba(216,180,90,0.5)', boxShadow: '0 0 18px rgba(216,180,90,0.18)' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#e8c874' }} />
                    <span className="font-display text-[11px] font-bold tracking-[0.1em] text-aetas-gold-bright">{t('game.yourTurnShort')}</span>
                    <span className="text-[10px] text-aetas-dim">· T{gameState.turnNumber}</span>
                  </div>
                ) : (
                  <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full" style={GLASS}>
                    <span className="font-display text-[11px] font-bold tracking-[0.1em] text-aetas-dim">{t('game.waitingShort')}</span>
                    <span className="text-[10px] text-aetas-dim">· T{gameState.turnNumber}</span>
                  </div>
                )}
              </div>

              {/* Era chip */}
              <div className="pointer-events-auto hidden sm:flex flex-shrink-0 items-center gap-1 px-2 h-[34px] rounded-lg text-[11px] text-aetas-muted" style={GLASS}>
                {ERA_ICONS[gameState.era]} {t(ERA_NAME_KEY[gameState.era])}
              </div>

              {/* Menu */}
              <GameMenu
                rank={myRank}
                incomingProposals={incomingProposals}
                maintenanceUnits={myUnitCount}
                godMode={godMode}
                onScore={() => setShowScoreModal(true)}
                onDiplomacy={() => setDiplomacyOpenSignal(s => s + 1)}
                onRefresh={() => void fetchGame()}
                onToggleGod={setGodMode}
              />
            </div>

            {/* Resource strip */}
            {myPlayer && (
              <div className="flex justify-center gap-2">
                {(['gold', 'food', 'production'] as const).map(k => {
                  const inc = myIncome[k]
                  return (
                    <div key={k} className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={GLASS}>
                      {RESOURCE_ICONS[k]}
                      <span className="text-sm font-bold text-aetas-gold-bright leading-none">{myPlayer.resources[k]}</span>
                      <span className={`text-[11px] font-medium leading-none ${inc >= 0 ? 'text-aetas-positive' : 'text-red-400'}`}>
                        {inc >= 0 ? `+${inc}` : inc}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ActionSheet: desktop sidebar OR mobile bottom sheet */}
        <ActionSheet
          gameState={gameState}
          myEnginePlayerId={enginePlayerId}
          isMyTurn={isMyTurn}
          selectedUnitId={selectedUnitId}
          log={log}
          expandSignal={diplomacyOpenSignal}
          onEndTurn={() => { void handleEndTurn() }}
          onResolveDispute={(id) => { void handleResolveDispute(id) }}
          onInitiateCombat={handleInitiateCombat}
          onFoundCity={setFoundingUnitId}
          onAttackCity={(uid, cid) => { void handleAttackCity(uid, cid) }}
          onFortifyUnit={(uid) => { void handleFortifyUnit(uid) }}
          onDeselectUnit={() => setSelectedUnitId(null)}
          onProposePact={(tgt) => { void handleProposePact(tgt) }}
          onDeclareWar={(tgt) => setWarTarget(tgt)}
          onBreakPact={(tgt) => { void handleBreakPact(tgt) }}
          onProposePeace={(tgt) => { void handleProposePeace(tgt) }}
          onProposeTrade={(tgt) => setTradeTarget(tgt)}
          onRespondDiplomacy={(id, accept) => { void handleRespondDiplomacy(id, accept) }}
        />
      </div>

      {/* ── City modal ── */}
      {selectedCityId && (() => {
        const city = gameState.cities.find(c => c.id === selectedCityId)
        return city ? (
          <CityModal
            city={city}
            gameState={gameState}
            myEnginePlayerId={enginePlayerId}
            onClose={() => setSelectedCityId(null)}
            onConstructBuilding={(c, b) => { void handleConstructBuilding(c, b) }}
            onTrainUnit={(c, u) => { void handleTrainUnit(c, u) }}
            onFortifyCity={(c, g) => { void handleFortifyCity(c, g) }}
            onBuildWonder={(c, w) => { void handleBuildWonder(c, w) }}
          />
        ) : null
      })()}

      {/* ── Found city modal ── */}
      {foundingUnitId && (
        <FoundCityModal
          onConfirm={(spec) => { void handleFoundCity(spec) }}
          onCancel={() => setFoundingUnitId(null)}
          isLoading={foundCityLoading}
        />
      )}

      {/* ── Combat preview modal ── */}
      {combatPreview && (() => {
        const atk = gameState?.units.find(u => u.id === combatPreview.attackerId)
        const def = gameState?.units.find(u => u.id === combatPreview.defenderId)
        return atk && def && gameState ? (
          <CombatPreviewModal
            attacker={atk}
            defender={def}
            attackerCivName={civName(gameState.players, atk.ownerId)}
            defenderCivName={civName(gameState.players, def.ownerId)}
            gameState={gameState}
            onConfirm={() => { void handleConfirmAttack(atk.id, def.id) }}
            onCancel={() => setCombatPreview(null)}
            isLoading={combatLoading}
          />
        ) : null
      })()}

      {/* ── Era advancement modal ── */}
      {eraModal && (
        <EraModal
          era={eraModal.era}
          prevEra={eraModal.prevEra}
          myCivId={gameState.players.find(p => p.id === enginePlayerId)?.civilizationId ?? ''}
          onClose={() => setEraModal(null)}
        />
      )}

      {/* ── Declare war confirmation ── */}
      {warTarget && (
        <DeclareWarModal
          targetCivName={civName(gameState.players, warTarget)}
          hasPact={relationBetween(gameState, enginePlayerId, warTarget) === 'pact'}
          onConfirm={() => { void handleDeclareWar(warTarget) }}
          onCancel={() => setWarTarget(null)}
          isLoading={diplomacyLoading}
        />
      )}

      {/* ── Resource trade modal ── */}
      {tradeTarget && (() => {
        const me = gameState.players.find(p => p.id === enginePlayerId)
        const target = gameState.players.find(p => p.id === tradeTarget)
        return me && target ? (
          <TradeModal
            proposerResources={me.resources}
            targetResources={target.resources}
            targetCivName={civName(gameState.players, tradeTarget)}
            onConfirm={(offer, request) => { void handleProposeTrade(tradeTarget, offer, request) }}
            onCancel={() => setTradeTarget(null)}
            isLoading={diplomacyLoading}
          />
        ) : null
      })()}

      {/* ── Score modal ── */}
      {showScoreModal && (
        <ScoreModal
          gameState={gameState}
          myEnginePlayerId={enginePlayerId}
          onClose={() => setShowScoreModal(false)}
        />
      )}

      {/* ── Game over screen ── */}
      {showGameOver && (
        <GameOverScreen
          gameState={gameState}
          myEnginePlayerId={enginePlayerId}
          xpGain={xpGain}
          onBack={onBack}
        />
      )}

      {/* ── Game over hint (when not showing full screen) ── */}
      {isFinished && !showGameOver && (
        <button
          onClick={() => setShowGameOver(true)}
          className="fixed bottom-24 md:bottom-4 right-4 z-20 px-4 py-2 rounded-xl bg-aetas-surface border border-aetas-border-strong text-aetas-muted text-sm font-medium hover:bg-aetas-raised transition-colors shadow-lg"
        >
          {t('game.viewResult')}
        </button>
      )}

      {/* ── XP toasts ── */}
      <XpToast toasts={xpToasts} />
      <EventToast toasts={eventToasts} />

      {/* ── Level-up modal ── */}
      {levelUpData !== null && (
        <LevelUpModal level={levelUpData} onClose={() => setLevelUpData(null)} />
      )}

      {/* ── Tutorial overlay ── */}
      <TutorialOverlay step={tutorialStep} onSkip={skipTutorial} />
    </div>
  )
}

/** Consolidated ⚙️ menu (spec-2 §A.1): scoreboard/rank, diplomacy, refresh, God. */
function GameMenu({
  rank, incomingProposals, maintenanceUnits, godMode,
  onScore, onDiplomacy, onRefresh, onToggleGod,
}: {
  rank: { position: number; total: number } | null
  incomingProposals: number
  maintenanceUnits: number
  godMode: boolean
  onScore: () => void
  onDiplomacy: () => void
  onRefresh: () => void
  onToggleGod: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const item = 'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-aetas-muted hover:bg-white/5 transition-colors'

  return (
    <div className="pointer-events-auto relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-[34px] h-[34px] flex items-center justify-center rounded-lg text-aetas-muted hover:text-aetas-text text-lg"
        style={GLASS}
        title={t('game.diplomacyTitle')}
      >
        ⚙
        {incomingProposals > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold">
            {incomingProposals}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg overflow-hidden" style={{ ...GLASS, border: '1px solid rgba(201,169,78,0.3)' }}>
            <button className={item} onClick={() => { onScore(); setOpen(false) }}>
              🏆 <span className="flex-1">{t('game.menuScore')}</span>
              {rank && <span className="text-aetas-dim text-xs">{t('game.rankBadge', { pos: rank.position, total: rank.total })}</span>}
            </button>
            <button className={item} onClick={() => { onDiplomacy(); setOpen(false) }}>
              ⚖️ <span className="flex-1">{t('game.diplomacyTitle')}</span>
              {incomingProposals > 0 && (
                <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold">{incomingProposals}</span>
              )}
            </button>
            <button className={item} onClick={() => { onRefresh(); setOpen(false) }}>
              ↺ <span className="flex-1">{t('game.refreshTitle')}</span>
            </button>
            {import.meta.env.DEV && (
              <label className="flex items-center gap-2 px-3 py-2.5 text-sm text-aetas-dim cursor-pointer select-none hover:bg-white/5">
                <input type="checkbox" checked={godMode} onChange={e => onToggleGod(e.target.checked)} className="accent-aetas-gold" />
                God mode
              </label>
            )}
            {maintenanceUnits > 0 && (
              <div className="px-3 py-2 text-[11px] text-aetas-dim border-t border-white/10">
                {t('game.maintenance', { n: maintenanceUnits, g: maintenanceUnits })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
