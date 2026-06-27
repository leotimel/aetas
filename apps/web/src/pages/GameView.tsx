import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameState, HexCoord, CitySpecialization, Unit, Resources } from '@aetas/game-engine'
import { Era, BuildingType, UnitType, CIVILIZATIONS, UNIT_CATALOG, SPECIAL_UNIT_CATALOG, BUILDING_CATALOG, CombatDisputeStatus, relationBetween, xpToLevel, computeCityProduction } from '@aetas/game-engine'
import { supabase } from '../supabase.ts'
import { submitAction, resolveDispute, awardXp, awardActionXp } from '../api.ts'
import HexMap from '../components/HexMap.tsx'
import ActionSheet from '../components/ActionSheet.tsx'
import PlayerBar from '../components/PlayerBar.tsx'
import CityModal from '../components/CityModal.tsx'
import FoundCityModal from '../components/FoundCityModal.tsx'
import CombatPreviewModal from '../components/CombatPreviewModal.tsx'
import TradeModal from '../components/TradeModal.tsx'
import DeclareWarModal from '../components/DeclareWarModal.tsx'
import GameOverScreen from '../components/GameOverScreen.tsx'
import ScoreModal from '../components/ScoreModal.tsx'
import EraModal, { ERA_ICONS } from '../components/EraModal.tsx'
import XpToast, { type XpToastItem } from '../components/XpToast.tsx'
import LevelUpModal from '../components/LevelUpModal.tsx'
import ResourceBar from '../components/ResourceBar.tsx'
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

const ERA_BG_COLOR: Record<Era, string> = {
  [Era.Ancient]:   'rgba(180, 100, 30, 0.04)',
  [Era.Classical]: 'rgba(70, 130, 180, 0.04)',
  [Era.Medieval]:  'rgba(100, 110, 120, 0.04)',
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
  const [levelUpData, setLevelUpData] = useState<number | null>(null)
  const [tutorialStep, setTutorialStep] = useState<number>(() =>
    localStorage.getItem('aetas-tutorial-done') ? -1 : 0
  )

  const gameStateRef    = useRef<GameState | null>(null)
  const prevEraRef      = useRef<Era | null>(null)
  const knownUnitIdsRef = useRef<Set<string>>(new Set())
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
    setCombatLoading(true)
    const res = await submitAction(gameId, { type: 'initiateCombat', attackerUnitId, defenderUnitId })
    setCombatLoading(false)
    addLog(res.ok ? i18n.t('combat.initiated') : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setCombatPreview(null); setSelectedUnitId(null); applyOrFetch(res.data?.state) }
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

  const handleAttackCity = async (unitId: string, cityId: string) => {
    const preState = gameState!
    const res = await submitAction(gameId, { type: 'attackCity', unitId, cityId })
    if (res.ok) {
      const postState = res.data?.state ?? null
      if (postState) setGameState(postState)
      else void fetchGame()
      addLog(formatCityAttackLog(preState, postState, unitId, cityId))
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

  const handleRespondDiplomacy = async (proposalId: string, accept: boolean) => {
    const preState = gameState!
    const res = await submitAction(gameId, { type: 'respondToDiplomacy', proposalId, accept })
    if (res.ok) {
      const postState = res.data?.state ?? null
      if (postState) {
        setGameState(postState)
        for (const line of diffDiplomacyForLog(preState, postState)) addLog(line)
      } else {
        const fetched = await fetchGame()
        if (fetched) for (const line of diffDiplomacyForLog(preState, fetched)) addLog(line)
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

  return (
    <div className="flex flex-col h-screen bg-aetas-bg text-aetas-text overflow-hidden">
      {/* ── Top bar ── */}
      <header
        className="flex items-center gap-2 px-3 py-2 bg-aetas-surface border-b border-aetas-border flex-shrink-0 flex-wrap"
        style={{ background: `linear-gradient(to right, ${ERA_BG_COLOR[gameState.era]}, transparent), var(--color-aetas-surface)` }}
      >
        <button
          onClick={onBack}
          className="text-aetas-muted hover:text-aetas-text transition-colors text-sm"
        >
          {t('ui.backToList')}
        </button>

        <span className="text-aetas-dim text-xs truncate max-w-[160px]" title={gameId}>
          {(() => {
            const opponents = gameState.players.filter(p => p.id !== enginePlayerId)
            if (opponents.length === 0) return gameId.slice(0, 8) + '…'
            const names = opponents.map(p => {
              const civ = CIVILIZATIONS.find(c => c.id === p.civilizationId)
              return p.displayName !== p.id.slice(0, 8)
                ? p.displayName
                : (civ?.name ?? p.id.slice(0, 6))
            }).join(' · ')
            const label = `vs ${names}`
            return label.length > 28 ? label.slice(0, 27) + '…' : label
          })()}
        </span>

        <span className="text-aetas-dim text-xs">
          {t('game.turnStatus', { n: gameState.turnNumber, max: gameState.maxTurns })}
        </span>

        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-aetas-muted border border-aetas-border rounded-full px-2 py-0.5">
          {ERA_ICONS[gameState.era]} {t(ERA_NAME_KEY[gameState.era])}
        </span>

        <span className={`text-xs font-semibold ml-1 ${isMyTurn ? 'text-aetas-gold' : 'text-aetas-dim'}`}>
          {isFinished
            ? gameState.winner
              ? t('game.finished', { winner: civName(gameState.players, gameState.winner) })
              : t('game.draw')
            : isMyTurn
              ? t('game.yourTurn')
              : t('game.theirTurn', { player: civName(gameState.players, gameState.currentPlayerId) })}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setDiplomacyOpenSignal(s => s + 1)}
            className="relative h-10 px-2 sm:px-3 flex items-center gap-1 justify-center rounded-lg bg-aetas-raised text-aetas-muted hover:text-aetas-text transition-colors text-sm"
            title={t('game.diplomacyTitle')}
          >
            ⚖️
            <span className="hidden sm:inline text-xs">{t('game.diplomacyTitle')}</span>
            {incomingProposals > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold">
                {incomingProposals}
              </span>
            )}
          </button>
          {import.meta.env.DEV && (
            <label className="flex items-center gap-1.5 text-aetas-dim text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={godMode}
                onChange={e => setGodMode(e.target.checked)}
                className="accent-aetas-gold"
              />
              God
            </label>
          )}
          <button
            onClick={() => void fetchGame()}
            className="h-10 px-2 sm:px-3 flex items-center gap-1 justify-center rounded-lg bg-aetas-raised text-aetas-muted hover:text-aetas-text transition-colors text-sm"
            title={t('game.refreshTitle')}
          >
            ↺
            <span className="hidden sm:inline text-xs">{t('game.refreshTitle')}</span>
          </button>
        </div>
      </header>

      {/* ── Turn progress bar ── */}
      <div className="h-0.5 bg-aetas-raised flex-shrink-0">
        <div
          className="h-full bg-aetas-gold transition-all duration-500"
          style={{ width: `${Math.min(100, (gameState.turnNumber / gameState.maxTurns) * 100)}%` }}
        />
      </div>

      {/* ── Resource HUD ── */}
      {myPlayer && (
        <ResourceBar
          resources={myPlayer.resources}
          income={myIncome}
        />
      )}

      {/* ── Player bar ── */}
      <div className="flex-shrink-0 border-b border-aetas-border">
        <PlayerBar
          gameState={gameState}
          myEnginePlayerId={enginePlayerId}
          onScoreClick={() => setShowScoreModal(true)}
        />
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0">
        {/* Hex map */}
        <div className="relative flex-1 min-h-0 bg-aetas-bg">
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

      {/* ── Level-up modal ── */}
      {levelUpData !== null && (
        <LevelUpModal level={levelUpData} onClose={() => setLevelUpData(null)} />
      )}

      {/* ── Tutorial overlay ── */}
      <TutorialOverlay step={tutorialStep} onSkip={skipTutorial} />
    </div>
  )
}
