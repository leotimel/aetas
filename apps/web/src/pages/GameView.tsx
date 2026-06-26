import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { GameState, HexCoord, CitySpecialization, Unit, Era, Resources } from '@aetas/game-engine'
import { BuildingType, UnitType, CIVILIZATIONS, UNIT_CATALOG, SPECIAL_UNIT_CATALOG, BUILDING_CATALOG, CombatDisputeStatus, relationBetween, xpToLevel, computeCityProduction } from '@aetas/game-engine'
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
import EraModal, { ERA_ICONS, ERA_NAMES_PT } from '../components/EraModal.tsx'
import XpToast, { type XpToastItem } from '../components/XpToast.tsx'
import LevelUpModal from '../components/LevelUpModal.tsx'
import ResourceBar from '../components/ResourceBar.tsx'

interface Props {
  gameId: string
  userId: string
  onBack: () => void
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
    return `⚔️ Seu ${atkName} destruiu o ${defName} dos ${defCiv}. (+${dmgToDef} dano${dmgToAtk > 0 ? `, −${dmgToAtk} HP` : ''})`
  if (atkDestroyed)
    return `⚔️ Seu ${atkName} foi destruído pelo ${defName} dos ${defCiv}. (inimigo: ${defPostHp} HP)`
  return `⚔️ Seu ${atkName} atacou o ${defName} dos ${defCiv}. (−${dmgToDef} HP deles, −${dmgToAtk} HP seus)`
}

function formatCityAttackLog(pre: GameState, post: GameState | null, unitId: string, cityId: string): string {
  const unit = pre.units.find(u => u.id === unitId)
  const city = pre.cities.find(c => c.id === cityId)
  if (!unit || !city) return '🏰 Ataque à cidade realizado'
  const postCity = post?.cities.find(c => c.id === cityId)
  const captured = postCity && postCity.ownerId !== city.ownerId
  const name = unitLabel(unit.unitType)
  if (captured) return `🏰 Seu ${name} capturou ${city.name}!`
  const dmg = (city.hp ?? 10) - (postCity?.hp ?? city.hp ?? 10)
  return `🏰 Seu ${name} atacou ${city.name} (−${dmg} HP, restante: ${postCity?.hp ?? '?'}/${city.maxHp ?? 10})`
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** Narrative lines for diplomacy changes between two snapshots — shown to every player. */
function diffDiplomacyForLog(pre: GameState, post: GameState): string[] {
  const logs: string[] = []
  const name = (id: string) => civName(post.players, id)

  const preWars  = new Set((pre.wars ?? []).map(w => pairKey(w.declarerId, w.targetId)))
  const postWars = new Set((post.wars ?? []).map(w => pairKey(w.declarerId, w.targetId)))
  const prePacts  = new Set(pre.nonAggressionPacts.map(p => pairKey(p.proposerId, p.acceptorId)))
  const postPacts = new Set(post.nonAggressionPacts.map(p => pairKey(p.proposerId, p.acceptorId)))

  for (const w of post.wars ?? []) {
    if (!preWars.has(pairKey(w.declarerId, w.targetId))) {
      logs.push(`⚔️ ${name(w.declarerId)} declarou guerra a ${name(w.targetId)}!`)
    }
  }
  for (const k of preWars) {
    if (!postWars.has(k)) {
      const [a, b] = k.split('|')
      logs.push(`🕊️ ${name(a)} e ${name(b)} firmaram a paz.`)
    }
  }
  for (const p of post.nonAggressionPacts) {
    if (!prePacts.has(pairKey(p.proposerId, p.acceptorId))) {
      logs.push(`🤝 ${name(p.proposerId)} e ${name(p.acceptorId)} firmaram um pacto.`)
    }
  }
  for (const k of prePacts) {
    if (!postPacts.has(k) && !postWars.has(k)) {
      const [a, b] = k.split('|')
      logs.push(`💔 O pacto entre ${name(a)} e ${name(b)} foi rompido.`)
    }
  }
  const preResolved = new Set(pre.diplomaticProposals.filter(p => p.status !== 'pending').map(p => p.id))
  for (const p of post.diplomaticProposals) {
    if (preResolved.has(p.id) || p.status === 'pending') continue
    const kind = p.kind ?? (p.terms ? 'trade' : 'pact')
    const label = kind === 'trade' ? 'troca' : kind === 'peace' ? 'paz' : 'pacto'
    if (p.status === 'accepted') {
      if (kind === 'trade') logs.push(`📦 Troca aceita entre ${name(p.proposerId)} e ${name(p.targetId)}.`)
    } else if (p.status === 'rejected') {
      logs.push(`❌ ${name(p.targetId)} recusou a ${label} de ${name(p.proposerId)}.`)
    }
  }
  for (const p of post.players) {
    const prev = pre.players.find(pl => pl.id === p.id)
    if (!prev?.isEliminated && p.isEliminated) {
      logs.push(`🚫 ${name(p.id)} foi eliminado da partida.`)
    }
  }
  return logs
}

function errorLabel(err?: string | null): string {
  if (!err) return 'ação inválida'
  const known: Record<string, string> = {
    'unit has already attacked this turn': 'unidade já atacou neste turno',
    'unit has already moved this turn': 'unidade já se moveu neste turno',
    'city hex occupied': 'hex da cidade ocupado',
    'insufficient production': 'produção insuficiente',
    'target is not adjacent': 'alvo não é adjacente',
    'cannot move to water': 'não é possível mover para água',
    'target hex is occupied': 'hex alvo está ocupado',
    'target out of movement range': 'alvo fora do alcance de movimento',
    'unit is not yours': 'unidade não é sua',
    'unit is already there': 'unidade já está neste hex',
    'not your city': 'não é sua cidade',
    'city not found': 'cidade não encontrada',
    'unit not found': 'unidade não encontrada',
    'dispute already resolved': 'disputa já resolvida',
    'unit not available in this era': 'unidade não disponível nesta era',
    'building already constructed': 'edifício já construído',
    'construction already in progress': 'construção em andamento',
    'unit cannot found a city': 'unidade não pode fundar cidade',
    'cannot found a city on water': 'não é possível fundar em água',
    'too close to an existing city': 'muito perto de outra cidade',
    'cannot attack your own city': 'não é possível atacar sua própria cidade',
    'city is not adjacent': 'cidade não é adjacente',
    'non-aggression pact prevents this attack': 'um pacto de não-agressão impede este ataque',
    'no contact established between players': 'sem contato com esta civilização',
    'non-aggression pact already exists': 'já existe um pacto com esta civilização',
    'a pending non-aggression pact proposal already exists': 'já há uma proposta de pacto pendente',
    'proposer lacks resources for this offer': 'você não tem recursos para esta oferta',
    'proposer no longer has enough resources': 'recursos insuficientes para concluir a troca',
    'target lacks resources for this trade': 'o alvo não tem recursos para esta troca',
    'trade must include at least one resource': 'a troca precisa incluir ao menos um recurso',
    'players are not at war': 'vocês não estão em guerra',
    'already at war': 'vocês já estão em guerra',
    'no non-aggression pact to break': 'não há pacto para romper',
    'a pending peace proposal already exists': 'já há uma proposta de paz pendente',
    'proposal not found': 'proposta não encontrada',
    'only the proposal target can respond': 'apenas o alvo da proposta pode responder',
    'proposal already resolved': 'proposta já resolvida',
  }
  return known[err] ?? err
}

export default function GameView({ gameId, userId, onBack }: Props) {
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
        addLog(isMe ? `Turno ${p.turnNumber} — sua vez!` : `Turno ${p.turnNumber} — vez de ${name}`)
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
              else addLog('⚔️ Combate resolvido — ver log para resultado')
            } else {
              addLog('⚔️ Combate resolvido')
            }
          }
        })
      })
      .on('broadcast', { event: 'game_over' }, (msg) => {
        const p = msg.payload as { winnerId: string | null }
        const players = gameStateRef.current?.players
        addLog(p.winnerId ? `★ ${civName(players, p.winnerId)} venceu a partida!` : '★ Fim de partida — empate!')
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
    addLog(res.ok ? 'Turno encerrado' : `✗ ${errorLabel(res.error)}`)
    if (res.ok) {
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
    addLog(res.ok ? 'Ataque iniciado ⚔️ — aguardando resposta do adversário' : `✗ ${errorLabel(res.error)}`)
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
      else addLog('⚔️ Combate resolvido')
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
    addLog(res.ok ? `${buildingLabel(buildingType)} em construção` : `✗ ${errorLabel(res.error)}`)
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
    addLog(res.ok ? 'Unidade movida' : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setSelectedUnitId(null); applyOrFetch(res.data?.state) }
  }

  // ─── Diplomacy ──────────────────────────────────────────────────────────────

  const civOf = (id: string) => civName(gameState?.players, id)

  const handleProposePact = async (targetId: string) => {
    const res = await submitAction(gameId, { type: 'proposePact', targetId })
    addLog(res.ok ? `🤝 Pacto proposto aos ${civOf(targetId)}` : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleBreakPact = async (targetId: string) => {
    const res = await submitAction(gameId, { type: 'breakPact', targetId })
    addLog(res.ok ? `💔 Pacto com os ${civOf(targetId)} rompido` : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleProposePeace = async (targetId: string) => {
    const res = await submitAction(gameId, { type: 'proposePeace', targetId })
    addLog(res.ok ? `🕊️ Paz proposta aos ${civOf(targetId)}` : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  const handleDeclareWar = async (targetId: string) => {
    setDiplomacyLoading(true)
    const res = await submitAction(gameId, { type: 'declareWar', targetId })
    setDiplomacyLoading(false)
    addLog(res.ok ? `⚔️ Você declarou guerra aos ${civOf(targetId)}!` : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setWarTarget(null); applyOrFetch(res.data?.state) }
  }

  const handleProposeTrade = async (targetId: string, offer: Resources, request: Resources) => {
    setDiplomacyLoading(true)
    const res = await submitAction(gameId, { type: 'proposeTrade', targetId, offer, request })
    setDiplomacyLoading(false)
    addLog(res.ok ? `📦 Troca proposta aos ${civOf(targetId)}` : `✗ ${errorLabel(res.error)}`)
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
    addLog(res.ok ? `${cityName} fundada!` : `✗ ${errorLabel(res.error)}`)
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
    addLog(res.ok ? `${unitLabel(unitType)} treinada com sucesso!` : `✗ ${errorLabel(res.error)}`)
    if (res.ok) applyOrFetch(res.data?.state)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-aetas-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-aetas-border border-t-aetas-muted animate-spin" />
          <p className="text-aetas-dim text-sm">Carregando partida…</p>
        </div>
      </div>
    )
  }

  if (error || !gameState) {
    return (
      <div className="min-h-screen bg-aetas-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-3">{error || 'Erro ao carregar partida.'}</p>
          <button onClick={onBack} className="text-aetas-muted hover:text-aetas-text text-sm underline">
            Voltar
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
      <header className="flex items-center gap-2 px-3 py-2 bg-aetas-surface border-b border-aetas-border flex-shrink-0 flex-wrap">
        <button
          onClick={onBack}
          className="text-aetas-muted hover:text-aetas-text transition-colors text-sm"
        >
          ← Lista
        </button>

        <span className="text-aetas-dim font-mono text-xs">{gameId.slice(0, 8)}…</span>

        <span className="text-aetas-dim text-xs">Turno {gameState.turnNumber}/{gameState.maxTurns}</span>

        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-aetas-muted border border-aetas-border rounded-full px-2 py-0.5">
          {ERA_ICONS[gameState.era]} {ERA_NAMES_PT[gameState.era]}
        </span>

        <span className={`text-xs font-semibold ml-1 ${isMyTurn ? 'text-aetas-gold' : 'text-aetas-dim'}`}>
          {isFinished
            ? `★ ${gameState.winner ? `${civName(gameState.players, gameState.winner)} venceu` : 'Empate'}`
            : isMyTurn
              ? '● SUA VEZ'
              : `○ vez de ${civName(gameState.players, gameState.currentPlayerId)}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setDiplomacyOpenSignal(s => s + 1)}
            className="relative w-7 h-7 flex items-center justify-center rounded-lg bg-aetas-raised text-aetas-muted hover:text-aetas-text transition-colors text-sm"
            title="Diplomacia"
          >
            ⚖️
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
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-aetas-raised text-aetas-muted hover:text-aetas-text transition-colors text-sm"
            title="Atualizar"
          >
            ↺
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
        {/* Hex map — fills remaining space */}
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
          onProposePact={(t) => { void handleProposePact(t) }}
          onDeclareWar={(t) => setWarTarget(t)}
          onBreakPact={(t) => { void handleBreakPact(t) }}
          onProposePeace={(t) => { void handleProposePeace(t) }}
          onProposeTrade={(t) => setTradeTarget(t)}
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
          🏆 Ver resultado
        </button>
      )}

      {/* ── XP toasts ── */}
      <XpToast toasts={xpToasts} />

      {/* ── Level-up modal ── */}
      {levelUpData !== null && (
        <LevelUpModal level={levelUpData} onClose={() => setLevelUpData(null)} />
      )}
    </div>
  )
}
