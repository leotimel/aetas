// src/disputes.ts
function toRow(dispute, gameId) {
  return {
    id: dispute.id,
    gameId,
    attackerPlayerId: dispute.attackerPlayerId,
    defenderPlayerId: dispute.defenderPlayerId,
    status: dispute.status,
    expiresAt: dispute.expiresAt
  };
}
function diffDisputes(pre, post, gameId) {
  const preById = new Map(pre.map((d) => [d.id, d]));
  const inserts = [];
  const statusUpdates = [];
  for (const d of post) {
    const before = preById.get(d.id);
    if (!before) {
      inserts.push(toRow(d, gameId));
    } else if (before.status !== d.status) {
      statusUpdates.push({ id: d.id, status: d.status });
    }
  }
  return { inserts, statusUpdates };
}

// ../game-engine/src/types.ts
var TurnState = /* @__PURE__ */ ((TurnState2) => {
  TurnState2["WaitingForAction"] = "waitingForAction";
  TurnState2["Processing"] = "processing";
  TurnState2["Completed"] = "completed";
  return TurnState2;
})(TurnState || {});
var CitySpecialization = /* @__PURE__ */ ((CitySpecialization2) => {
  CitySpecialization2["Military"] = "military";
  CitySpecialization2["Commercial"] = "commercial";
  CitySpecialization2["Scientific"] = "scientific";
  return CitySpecialization2;
})(CitySpecialization || {});
var ResourceType = /* @__PURE__ */ ((ResourceType2) => {
  ResourceType2["Gold"] = "gold";
  ResourceType2["Food"] = "food";
  ResourceType2["Production"] = "production";
  return ResourceType2;
})(ResourceType || {});
var Era = /* @__PURE__ */ ((Era2) => {
  Era2["Ancient"] = "ancient";
  Era2["Classical"] = "classical";
  Era2["Medieval"] = "medieval";
  return Era2;
})(Era || {});
var TerrainType = /* @__PURE__ */ ((TerrainType2) => {
  TerrainType2["Plains"] = "plains";
  TerrainType2["Forest"] = "forest";
  TerrainType2["Mountain"] = "mountain";
  TerrainType2["Hills"] = "hills";
  TerrainType2["Water"] = "water";
  return TerrainType2;
})(TerrainType || {});
var UnitType = /* @__PURE__ */ ((UnitType2) => {
  UnitType2["Warrior"] = "warrior";
  UnitType2["Archer"] = "archer";
  UnitType2["Knight"] = "knight";
  UnitType2["Settler"] = "settler";
  return UnitType2;
})(UnitType || {});
var CombatDisputeStatus = /* @__PURE__ */ ((CombatDisputeStatus2) => {
  CombatDisputeStatus2["Pending"] = "pending";
  CombatDisputeStatus2["ResolvedByAction"] = "resolvedByAction";
  CombatDisputeStatus2["ResolvedByTimeout"] = "resolvedByTimeout";
  return CombatDisputeStatus2;
})(CombatDisputeStatus || {});
var DiplomaticProposalStatus = /* @__PURE__ */ ((DiplomaticProposalStatus2) => {
  DiplomaticProposalStatus2["Pending"] = "pending";
  DiplomaticProposalStatus2["Accepted"] = "accepted";
  DiplomaticProposalStatus2["Rejected"] = "rejected";
  return DiplomaticProposalStatus2;
})(DiplomaticProposalStatus || {});

// ../game-engine/src/map.ts
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let z = Math.imul(s ^ s >>> 15, 1 | s);
    z = z + Math.imul(z ^ z >>> 7, 61 | z) >>> 0;
    return ((z ^ z >>> 14) >>> 0) / 4294967296;
  };
}
function createRng(seed) {
  return mulberry32(djb2(seed));
}
var HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];
function hexKey(coord) {
  return `${coord.q},${coord.r}`;
}
function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
function hexNeighbors(coord) {
  return HEX_DIRECTIONS.map((d) => ({ q: coord.q + d.q, r: coord.r + d.r }));
}
function hexesInRadius(center, radius) {
  const results = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
}
var TERRAIN_THRESHOLDS = [
  ["plains" /* Plains */, 0.4],
  ["forest" /* Forest */, 0.65],
  ["hills" /* Hills */, 0.8],
  ["mountain" /* Mountain */, 0.92],
  ["water" /* Water */, 1]
];
function pickTerrain(rng) {
  const roll = rng();
  for (const [type, threshold] of TERRAIN_THRESHOLDS) {
    if (roll < threshold) return type;
  }
  return "water" /* Water */;
}
function findStartPositions(tiles, playerCount, mapRadius) {
  const tileMap = /* @__PURE__ */ new Map();
  for (const tile of tiles) tileMap.set(hexKey(tile.coord), tile);
  const isValid = (coord) => {
    const tile = tileMap.get(hexKey(coord));
    return tile !== void 0 && tile.terrainType !== "water" /* Water */ && tile.terrainType !== "mountain" /* Mountain */;
  };
  const ringRadius = Math.round(mapRadius * 0.7);
  const taken = /* @__PURE__ */ new Set();
  const positions = [];
  for (let i = 0; i < playerCount; i++) {
    const angle = 2 * Math.PI * i / playerCount;
    const candidate = {
      q: Math.round(ringRadius * Math.cos(angle)),
      r: Math.round(ringRadius * Math.sin(angle))
    };
    let placed = false;
    for (let searchR = 0; searchR <= mapRadius && !placed; searchR++) {
      const sorted = hexesInRadius(candidate, searchR).sort((a, b) => hexDistance(a, candidate) - hexDistance(b, candidate));
      for (const c of sorted) {
        const key = hexKey(c);
        if (isValid(c) && !taken.has(key)) {
          taken.add(key);
          positions.push(c);
          placed = true;
          break;
        }
      }
    }
  }
  return positions;
}
function generateMap(radius, seed, playerCount) {
  const rng = createRng(seed);
  const allCoords = hexesInRadius({ q: 0, r: 0 }, radius);
  const tiles = allCoords.map((coord) => ({
    coord,
    terrainType: pickTerrain(rng)
  }));
  return {
    tiles,
    radius,
    seed,
    startPositions: findStartPositions(tiles, playerCount, radius)
  };
}
var UNIT_VISION_RADIUS = 2;
var CITY_VISION_RADIUS = 3;
function computeVisibleHexes(playerUnits, playerCities, mapRadius) {
  const mapHexKeys = new Set(
    hexesInRadius({ q: 0, r: 0 }, mapRadius).map(hexKey)
  );
  const visible = /* @__PURE__ */ new Map();
  const addIfOnMap = (coord) => {
    const key = hexKey(coord);
    if (mapHexKeys.has(key) && !visible.has(key)) {
      visible.set(key, coord);
    }
  };
  for (const unit of playerUnits) {
    for (const hex of hexesInRadius(unit.position, UNIT_VISION_RADIUS)) {
      addIfOnMap(hex);
    }
  }
  for (const city of playerCities) {
    for (const hex of hexesInRadius(city.position, CITY_VISION_RADIUS)) {
      addIfOnMap(hex);
    }
  }
  return Array.from(visible.values());
}
function updateFogOfWar(current, playerUnits, playerCities, mapRadius) {
  const newVisible = computeVisibleHexes(playerUnits, playerCities, mapRadius);
  const exploredMap = /* @__PURE__ */ new Map();
  for (const coord of current.exploredHexes) {
    exploredMap.set(hexKey(coord), coord);
  }
  for (const coord of newVisible) {
    exploredMap.set(hexKey(coord), coord);
  }
  return {
    playerId: current.playerId,
    visibleHexes: newVisible,
    exploredHexes: Array.from(exploredMap.values())
  };
}

// ../game-engine/src/economy.ts
var BASE_GOLD_PER_POP = 1;
var BASE_FOOD_PER_POP = 2;
var BASE_PRODUCTION_PER_POP = 1;
var LEVEL_BONUS_PER_LEVEL = 0.2;
var FOOD_PER_POPULATION_GROWTH = 20;
var SPECIALIZATION_MULTIPLIERS = {
  ["military" /* Military */]: {
    gold: 0.75,
    food: 0.75,
    production: 1.5
  },
  ["commercial" /* Commercial */]: {
    gold: 1.5,
    food: 1,
    production: 0.75
  },
  ["scientific" /* Scientific */]: {
    gold: 0.9,
    food: 1.25,
    production: 0.9
  }
};
function computeCityProduction(city) {
  if (city.population === 0) return { gold: 0, food: 0, production: 0 };
  const m = SPECIALIZATION_MULTIPLIERS[city.specialization];
  const lv = 1 + (city.level - 1) * LEVEL_BONUS_PER_LEVEL;
  return {
    gold: Math.round(city.population * BASE_GOLD_PER_POP * m.gold * lv),
    food: Math.round(city.population * BASE_FOOD_PER_POP * m.food * lv),
    production: Math.round(city.population * BASE_PRODUCTION_PER_POP * m.production * lv)
  };
}
function growthThreshold(population) {
  return population * FOOD_PER_POPULATION_GROWTH;
}
function applyGrowth(city, foodIncome) {
  const newFoodStored = city.foodStored + foodIncome;
  const threshold = growthThreshold(city.population);
  if (newFoodStored >= threshold) {
    return {
      ...city,
      population: city.population + 1,
      foodStored: newFoodStored - threshold
    };
  }
  return { ...city, foodStored: newFoodStored };
}
function processTurnEconomy(cities, existingResources) {
  let gold = existingResources.gold;
  let food = existingResources.food;
  let production = existingResources.production;
  const updatedCities = [];
  for (const city of cities) {
    const produced = computeCityProduction(city);
    gold += produced.gold;
    food += produced.food;
    production += produced.production;
    updatedCities.push(applyGrowth(city, produced.food));
  }
  return {
    updatedCities,
    updatedResources: { gold, food, production }
  };
}

// ../game-engine/src/turn.ts
function getPlayerById(state, id) {
  return state.players.find((p) => p.id === id);
}
function getCurrentPlayer(state) {
  return getPlayerById(state, state.currentPlayerId);
}
function activePlayers(players) {
  return players.filter((p) => !p.isEliminated);
}
function nextActivePlayerId(players, fromId) {
  const n = players.length;
  const fromIndex = players.findIndex((p) => p.id === fromId);
  if (fromIndex === -1) return null;
  for (let step = 1; step <= n; step++) {
    const candidate = players[(fromIndex + step) % n];
    if (candidate && !candidate.isEliminated) return candidate.id;
  }
  const from = players[fromIndex];
  return from && !from.isEliminated ? from.id : null;
}
function canSubmitAction(state, playerId) {
  if (state.isFinished) return { valid: false, reason: "game finished" };
  const player = getPlayerById(state, playerId);
  if (!player) return { valid: false, reason: "unknown player" };
  if (player.isEliminated) return { valid: false, reason: "player eliminated" };
  if (playerId !== state.currentPlayerId) return { valid: false, reason: "not your turn" };
  if (state.turnState !== "waitingForAction" /* WaitingForAction */) {
    return { valid: false, reason: "turn not awaiting action" };
  }
  return { valid: true };
}
function endTurn(state, playerId, now, hooks = {}) {
  const validation = canSubmitAction(state, playerId);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason, state };
  }
  const actorId = state.currentPlayerId;
  const activeAtStart = activePlayers(state.players);
  const wrap = activeAtStart[activeAtStart.length - 1]?.id === actorId;
  let players = state.players.map((p) => ({ ...p }));
  let cities = state.cities.map((c) => ({ ...c }));
  let combatDisputes = state.combatDisputes.map((d) => ({ ...d }));
  const actor = players.find((p) => p.id === actorId);
  if (actor) {
    const actorCities = cities.filter((c) => c.ownerId === actorId);
    const { updatedCities, updatedResources } = processTurnEconomy(actorCities, actor.resources);
    const updatedById = new Map(updatedCities.map((c) => [c.id, c]));
    cities = cities.map((c) => updatedById.get(c.id) ?? c);
    actor.resources = updatedResources;
  }
  combatDisputes.sort((a, b) => a.id.localeCompare(b.id));
  let working = { ...state, players, cities, combatDisputes };
  for (const dispute of combatDisputes) {
    if (dispute.status === "pending" /* Pending */ && now >= dispute.expiresAt) {
      dispute.status = "resolvedByTimeout" /* ResolvedByTimeout */;
      if (hooks.resolveTimedOutDispute) {
        working = hooks.resolveTimedOutDispute(dispute, working);
        players = working.players;
        cities = working.cities;
      }
    }
  }
  working = { ...working, players, cities, combatDisputes };
  const activeNow = activePlayers(players);
  if (activeNow.length <= 1) {
    return {
      ok: true,
      state: {
        ...working,
        currentPlayerId: actorId,
        turnState: "completed" /* Completed */,
        isFinished: true,
        winner: activeNow[0]?.id ?? null
      }
    };
  }
  if (wrap && state.turnNumber === state.maxTurns) {
    const winner = hooks.determineWinner ? hooks.determineWinner(working) : null;
    return {
      ok: true,
      state: {
        ...working,
        currentPlayerId: actorId,
        turnState: "completed" /* Completed */,
        isFinished: true,
        winner
      }
    };
  }
  const nextId = nextActivePlayerId(players, actorId);
  return {
    ok: true,
    state: {
      ...working,
      currentPlayerId: nextId ?? actorId,
      turnNumber: state.turnNumber + (wrap ? 1 : 0),
      turnState: "waitingForAction" /* WaitingForAction */
    }
  };
}

// ../game-engine/src/combat.ts
var COMBAT_TIMEOUT_MS = 24 * 60 * 60 * 1e3;
var MIN_DAMAGE = 1;
var ACTIVE_DEFENSE_BONUS = 2;
var TERRAIN_DEFENSE_BONUS = {
  ["plains" /* Plains */]: 0,
  ["forest" /* Forest */]: 2,
  ["hills" /* Hills */]: 3,
  ["mountain" /* Mountain */]: 4,
  ["water" /* Water */]: 0
};
function terrainDefenseBonus(terrain) {
  return TERRAIN_DEFENSE_BONUS[terrain];
}
function withHp(unit, hp) {
  return { ...unit, stats: { ...unit.stats, hp } };
}
function resolveCombat(attacker, defender, opts) {
  const attackerTerrain = opts.attackerTerrain ?? "plains" /* Plains */;
  const activeDefense = opts.defenderActiveDefense ?? false;
  if (defender.stats.hp <= 0) {
    return {
      attackerUnit: attacker,
      defenderUnit: defender,
      attackerDestroyed: attacker.stats.hp <= 0,
      defenderDestroyed: true,
      damageToAttacker: 0,
      damageToDefender: 0,
      winnerUnitId: attacker.stats.hp > 0 ? attacker.id : null
    };
  }
  const defenderDefense = defender.stats.defense + terrainDefenseBonus(opts.defenderTerrain) + (activeDefense ? ACTIVE_DEFENSE_BONUS : 0);
  const damageToDefender = Math.max(MIN_DAMAGE, attacker.stats.attack - defenderDefense);
  const defenderHp = defender.stats.hp - damageToDefender;
  if (defenderHp <= 0) {
    return {
      attackerUnit: attacker,
      defenderUnit: withHp(defender, defenderHp),
      attackerDestroyed: false,
      defenderDestroyed: true,
      damageToAttacker: 0,
      damageToDefender,
      winnerUnitId: attacker.id
    };
  }
  const attackerDefense = attacker.stats.defense + terrainDefenseBonus(attackerTerrain);
  const damageToAttacker = Math.max(MIN_DAMAGE, defender.stats.attack - attackerDefense);
  const attackerHp = attacker.stats.hp - damageToAttacker;
  const attackerDestroyed = attackerHp <= 0;
  return {
    attackerUnit: withHp(attacker, attackerHp),
    defenderUnit: withHp(defender, defenderHp),
    attackerDestroyed,
    defenderDestroyed: false,
    damageToAttacker,
    damageToDefender,
    winnerUnitId: attackerDestroyed ? defender.id : null
  };
}
function createCombatDispute(attacker, defender, now) {
  if (attacker.id === defender.id) {
    throw new Error("a unit cannot attack itself");
  }
  if (attacker.ownerId === defender.ownerId) {
    throw new Error("cannot open a dispute between units of the same player");
  }
  return {
    id: `dispute-${attacker.id}-${defender.id}-${now}`,
    attackerUnitId: attacker.id,
    defenderUnitId: defender.id,
    attackerPlayerId: attacker.ownerId,
    defenderPlayerId: defender.ownerId,
    createdAt: now,
    expiresAt: now + COMBAT_TIMEOUT_MS,
    status: "pending" /* Pending */
  };
}
function terrainAt(state, pos) {
  const key = hexKey(pos);
  const tile = state.map.tiles.find((t) => hexKey(t.coord) === key);
  return tile?.terrainType ?? "plains" /* Plains */;
}
function applyCombatResult(state, result) {
  const replacements = /* @__PURE__ */ new Map();
  if (!result.attackerDestroyed) replacements.set(result.attackerUnit.id, result.attackerUnit);
  if (!result.defenderDestroyed) replacements.set(result.defenderUnit.id, result.defenderUnit);
  const destroyed = /* @__PURE__ */ new Set();
  if (result.attackerDestroyed) destroyed.add(result.attackerUnit.id);
  if (result.defenderDestroyed) destroyed.add(result.defenderUnit.id);
  const units = state.units.filter((u) => !destroyed.has(u.id)).map((u) => replacements.get(u.id) ?? u);
  return { ...state, units };
}
function findUnit(state, id) {
  return state.units.find((u) => u.id === id);
}
function setDisputeStatus(state, disputeId, status) {
  return {
    ...state,
    combatDisputes: state.combatDisputes.map(
      (d) => d.id === disputeId ? { ...d, status } : d
    )
  };
}
function resolveDisputeByAction(state, disputeId, actingPlayerId, _now) {
  const dispute = state.combatDisputes.find((d) => d.id === disputeId);
  if (!dispute) return { ok: false, reason: "dispute not found", state };
  if (dispute.status !== "pending" /* Pending */) {
    return { ok: false, reason: "dispute already resolved", state };
  }
  if (actingPlayerId !== dispute.attackerPlayerId && actingPlayerId !== dispute.defenderPlayerId) {
    return { ok: false, reason: "player not involved in this dispute", state };
  }
  const attacker = findUnit(state, dispute.attackerUnitId);
  const defender = findUnit(state, dispute.defenderUnitId);
  if (!attacker || !defender) {
    return {
      ok: true,
      state: setDisputeStatus(state, disputeId, "resolvedByAction" /* ResolvedByAction */),
      result: null
    };
  }
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: actingPlayerId === dispute.defenderPlayerId
  });
  const applied = applyCombatResult(state, result);
  return {
    ok: true,
    state: setDisputeStatus(applied, disputeId, "resolvedByAction" /* ResolvedByAction */),
    result
  };
}
function resolveTimedOutDispute(dispute, state) {
  const attacker = findUnit(state, dispute.attackerUnitId);
  const defender = findUnit(state, dispute.defenderUnitId);
  if (!attacker || !defender) return state;
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: false
  });
  return applyCombatResult(state, result);
}

// ../game-engine/src/actions.ts
var DEFAULT_HOOKS = { resolveTimedOutDispute };
function findUnit2(state, id) {
  return state.units.find((u) => u.id === id);
}
function validateAction(state, playerId, action, _now) {
  const gate = canSubmitAction(state, playerId);
  if (!gate.valid) return gate;
  switch (action.type) {
    case "endTurn":
      return { valid: true };
    case "respondToDispute": {
      const dispute = state.combatDisputes.find((d) => d.id === action.disputeId);
      if (!dispute) return { valid: false, reason: "dispute not found" };
      if (dispute.status !== "pending" /* Pending */) {
        return { valid: false, reason: "dispute already resolved" };
      }
      if (playerId !== dispute.attackerPlayerId && playerId !== dispute.defenderPlayerId) {
        return { valid: false, reason: "player not involved in this dispute" };
      }
      return { valid: true };
    }
    case "initiateCombat": {
      const attacker = findUnit2(state, action.attackerUnitId);
      const defender = findUnit2(state, action.defenderUnitId);
      if (!attacker || !defender) return { valid: false, reason: "unit not found" };
      if (attacker.id === defender.id) {
        return { valid: false, reason: "a unit cannot attack itself" };
      }
      if (attacker.ownerId !== playerId) {
        return { valid: false, reason: "attacker is not yours" };
      }
      if (attacker.ownerId === defender.ownerId) {
        return { valid: false, reason: "cannot attack your own unit" };
      }
      if (hexDistance(attacker.position, defender.position) !== 1) {
        return { valid: false, reason: "target is not adjacent" };
      }
      if (attacker.hasAttacked) {
        return { valid: false, reason: "unit has already attacked this turn" };
      }
      const alreadyDisputing = state.combatDisputes.some(
        (d) => d.status === "pending" /* Pending */ && d.attackerUnitId === attacker.id
      );
      if (alreadyDisputing) {
        return { valid: false, reason: "unit already has a pending dispute" };
      }
      return { valid: true };
    }
  }
}
function applyAction(state, playerId, action, now, hooks = DEFAULT_HOOKS) {
  const validation = validateAction(state, playerId, action, now);
  if (!validation.valid) return { ok: false, reason: validation.reason, state };
  switch (action.type) {
    case "endTurn":
      return endTurn(state, playerId, now, hooks);
    case "respondToDispute": {
      const res = resolveDisputeByAction(state, action.disputeId, playerId, now);
      return res.ok ? { ok: true, state: res.state } : { ok: false, reason: res.reason, state: res.state };
    }
    case "initiateCombat": {
      const attacker = findUnit2(state, action.attackerUnitId);
      const defender = findUnit2(state, action.defenderUnitId);
      const dispute = createCombatDispute(attacker, defender, now);
      const units = state.units.map(
        (u) => u.id === attacker.id ? { ...u, hasAttacked: true } : u
      );
      return {
        ok: true,
        state: {
          ...state,
          units,
          combatDisputes: [...state.combatDisputes, dispute]
        }
      };
    }
  }
}

// ../game-engine/src/ai.ts
function isFavorableAttack(state, attacker, defender) {
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: true
  });
  return result.defenderDestroyed && !result.attackerDestroyed;
}
var byId = (a, b) => a.id.localeCompare(b.id);
function defendableDisputes(state, playerId) {
  return state.combatDisputes.filter((d) => d.status === "pending" /* Pending */ && d.defenderPlayerId === playerId).slice().sort(byId);
}
function planDefensiveResponses(state, playerId, now) {
  let s = state;
  const actions = [];
  for (const dispute of defendableDisputes(s, playerId)) {
    const action = { type: "respondToDispute", disputeId: dispute.id };
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action);
      const applied = applyAction(s, playerId, action, now);
      if (applied.ok) s = applied.state;
    }
  }
  return { state: s, actions };
}
var END_TURN = { type: "endTurn" };
function decideSubstituteTurn(state, playerId, now) {
  if (!canSubmitAction(state, playerId).valid) return [];
  const { actions } = planDefensiveResponses(state, playerId, now);
  return [...actions, END_TURN];
}
function decideOpponentTurn(state, playerId, now) {
  if (!canSubmitAction(state, playerId).valid) return [];
  const defensive = planDefensiveResponses(state, playerId, now);
  let s = defensive.state;
  const actions = [...defensive.actions];
  const myUnits = s.units.filter((u) => u.ownerId === playerId).slice().sort(byId);
  for (const unit of myUnits) {
    const current = s.units.find((u) => u.id === unit.id);
    if (!current) continue;
    const enemies = s.units.filter((e) => e.ownerId !== playerId && hexDistance(current.position, e.position) === 1).slice().sort(byId);
    for (const enemy of enemies) {
      const action = {
        type: "initiateCombat",
        attackerUnitId: current.id,
        defenderUnitId: enemy.id
      };
      if (isFavorableAttack(s, current, enemy) && validateAction(s, playerId, action, now).valid) {
        actions.push(action);
        const applied = applyAction(s, playerId, action, now);
        if (applied.ok) s = applied.state;
        break;
      }
    }
  }
  return [...actions, END_TURN];
}

// ../game-engine/src/diplomacy.ts
function haveMadeContact(state, playerAId, playerBId) {
  const fogA = state.fogOfWar.find((f) => f.playerId === playerAId);
  const fogB = state.fogOfWar.find((f) => f.playerId === playerBId);
  const exploredA = fogA ? new Set(fogA.exploredHexes.map(hexKey)) : null;
  const exploredB = fogB ? new Set(fogB.exploredHexes.map(hexKey)) : null;
  if (!exploredA && !exploredB) return false;
  for (const unit of state.units) {
    const key = hexKey(unit.position);
    if (unit.ownerId === playerBId && exploredA?.has(key)) return true;
    if (unit.ownerId === playerAId && exploredB?.has(key)) return true;
  }
  for (const city of state.cities) {
    const key = hexKey(city.position);
    if (city.ownerId === playerBId && exploredA?.has(key)) return true;
    if (city.ownerId === playerAId && exploredB?.has(key)) return true;
  }
  return false;
}
function isActive(state, playerId) {
  const p = state.players.find((pl) => pl.id === playerId);
  return !!p && !p.isEliminated;
}
function hasExistingPact(state, aId, bId) {
  return state.nonAggressionPacts.some(
    (p) => p.proposerId === aId && p.acceptorId === bId || p.proposerId === bId && p.acceptorId === aId
  );
}
function hasPendingNap(state, aId, bId) {
  return state.diplomaticProposals.some(
    (p) => p.status === "pending" /* Pending */ && p.terms === void 0 && (p.proposerId === aId && p.targetId === bId || p.proposerId === bId && p.targetId === aId)
  );
}
function proposeNonAggressionPact(state, proposerId, targetId) {
  if (!isActive(state, proposerId)) {
    return { ok: false, reason: "proposer is not an active player", state };
  }
  if (!isActive(state, targetId)) {
    return { ok: false, reason: "target is not an active player", state };
  }
  if (!haveMadeContact(state, proposerId, targetId)) {
    return { ok: false, reason: "no contact established between players", state };
  }
  if (hasExistingPact(state, proposerId, targetId)) {
    return { ok: false, reason: "non-aggression pact already exists", state };
  }
  if (hasPendingNap(state, proposerId, targetId)) {
    return { ok: false, reason: "a pending non-aggression pact proposal already exists", state };
  }
  const proposal = {
    id: `nap:${proposerId}:${targetId}:${state.turnNumber}`,
    proposerId,
    targetId,
    status: "pending" /* Pending */,
    createdAtTurn: state.turnNumber
  };
  return {
    ok: true,
    state: { ...state, diplomaticProposals: [...state.diplomaticProposals, proposal] }
  };
}
function respondToNonAggressionPact(state, responderId, proposalId, accept) {
  const proposal = state.diplomaticProposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: "proposal not found", state };
  if (proposal.terms !== void 0) {
    return { ok: false, reason: "proposal is not a non-aggression pact", state };
  }
  if (proposal.status !== "pending" /* Pending */) {
    return { ok: false, reason: "proposal already resolved", state };
  }
  if (proposal.targetId !== responderId) {
    return { ok: false, reason: "only the proposal target can respond", state };
  }
  const updatedProposals = state.diplomaticProposals.map(
    (p) => p.id === proposalId ? { ...p, status: accept ? "accepted" /* Accepted */ : "rejected" /* Rejected */ } : p
  );
  if (!accept) {
    return { ok: true, state: { ...state, diplomaticProposals: updatedProposals } };
  }
  const pact = {
    id: `pact:${proposal.proposerId}:${responderId}:${state.turnNumber}`,
    proposerId: proposal.proposerId,
    acceptorId: responderId,
    agreedAtTurn: state.turnNumber
  };
  return {
    ok: true,
    state: {
      ...state,
      diplomaticProposals: updatedProposals,
      nonAggressionPacts: [...state.nonAggressionPacts, pact]
    }
  };
}
function sufficient(have, need) {
  return have.gold >= need.gold && have.food >= need.food && have.production >= need.production;
}
function subtract(a, b) {
  return { gold: a.gold - b.gold, food: a.food - b.food, production: a.production - b.production };
}
function add(a, b) {
  return { gold: a.gold + b.gold, food: a.food + b.food, production: a.production + b.production };
}
function isNonTrivialTrade(terms) {
  return terms.offer.gold > 0 || terms.offer.food > 0 || terms.offer.production > 0 || terms.request.gold > 0 || terms.request.food > 0 || terms.request.production > 0;
}
function proposeResourceTrade(state, proposerId, targetId, terms) {
  if (!isActive(state, proposerId)) {
    return { ok: false, reason: "proposer is not an active player", state };
  }
  if (!isActive(state, targetId)) {
    return { ok: false, reason: "target is not an active player", state };
  }
  if (!haveMadeContact(state, proposerId, targetId)) {
    return { ok: false, reason: "no contact established between players", state };
  }
  if (!isNonTrivialTrade(terms)) {
    return { ok: false, reason: "trade must include at least one resource", state };
  }
  const proposer = state.players.find((p) => p.id === proposerId);
  if (!sufficient(proposer.resources, terms.offer)) {
    return { ok: false, reason: "proposer lacks resources for this offer", state };
  }
  const proposal = {
    id: `trade:${proposerId}:${targetId}:${state.turnNumber}`,
    proposerId,
    targetId,
    status: "pending" /* Pending */,
    createdAtTurn: state.turnNumber,
    terms
  };
  return {
    ok: true,
    state: { ...state, diplomaticProposals: [...state.diplomaticProposals, proposal] }
  };
}
function respondToResourceTrade(state, responderId, proposalId, accept) {
  const proposal = state.diplomaticProposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: "proposal not found", state };
  if (!proposal.terms) return { ok: false, reason: "proposal is not a resource trade", state };
  if (proposal.status !== "pending" /* Pending */) {
    return { ok: false, reason: "proposal already resolved", state };
  }
  if (proposal.targetId !== responderId) {
    return { ok: false, reason: "only the proposal target can respond", state };
  }
  const updatedProposals = state.diplomaticProposals.map(
    (p) => p.id === proposalId ? { ...p, status: accept ? "accepted" /* Accepted */ : "rejected" /* Rejected */ } : p
  );
  if (!accept) {
    return { ok: true, state: { ...state, diplomaticProposals: updatedProposals } };
  }
  const proposer = state.players.find((p) => p.id === proposal.proposerId);
  const target = state.players.find((p) => p.id === responderId);
  if (!sufficient(proposer.resources, proposal.terms.offer)) {
    return { ok: false, reason: "proposer no longer has enough resources", state };
  }
  if (!sufficient(target.resources, proposal.terms.request)) {
    return { ok: false, reason: "target lacks resources for this trade", state };
  }
  const terms = proposal.terms;
  const updatedPlayers = state.players.map((p) => {
    if (p.id === proposal.proposerId) {
      return { ...p, resources: add(subtract(p.resources, terms.offer), terms.request) };
    }
    if (p.id === responderId) {
      return { ...p, resources: add(subtract(p.resources, terms.request), terms.offer) };
    }
    return p;
  });
  return {
    ok: true,
    state: {
      ...state,
      players: updatedPlayers,
      diplomaticProposals: updatedProposals
    }
  };
}

// ../game-engine/src/scoring.ts
var TERRITORY_POINTS_PER_CITY = 10;
var POPULATION_POINTS_PER_POP = 3;
var DEVELOPMENT_POINTS_PER_LEVEL = 5;
function computePlayerScore(playerId, cities) {
  const owned = cities.filter((c) => c.ownerId === playerId);
  const territory = owned.length * TERRITORY_POINTS_PER_CITY;
  const population = owned.reduce((s, c) => s + c.population, 0) * POPULATION_POINTS_PER_POP;
  const development = owned.reduce((s, c) => s + c.level, 0) * DEVELOPMENT_POINTS_PER_LEVEL;
  return { playerId, territory, population, development, total: territory + population + development };
}
function rankPlayers(state) {
  return state.players.filter((p) => !p.isEliminated).map((p) => computePlayerScore(p.id, state.cities)).sort((a, b) => b.total - a.total || a.playerId.localeCompare(b.playerId));
}
function determineWinner(state) {
  const ranked = rankPlayers(state);
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0].playerId;
  if (ranked[0].total === ranked[1].total) return null;
  return ranked[0].playerId;
}
function eliminatePlayersWithNoCities(state) {
  const ownerSet = new Set(state.cities.map((c) => c.ownerId));
  const toEliminate = new Set(
    state.players.filter((p) => !p.isEliminated && !ownerSet.has(p.id)).map((p) => p.id)
  );
  if (toEliminate.size === 0) return state;
  return {
    ...state,
    players: state.players.map(
      (p) => toEliminate.has(p.id) ? { ...p, isEliminated: true } : p
    ),
    units: state.units.filter((u) => !toEliminate.has(u.ownerId))
  };
}

// src/orchestration.ts
var TURN_TIMEOUT_MS = 24 * 60 * 60 * 1e3;
var FULL_HOOKS = { resolveTimedOutDispute, determineWinner };
var NOT_FOUND = (reason) => ({ ok: false, kind: "not_found", reason });
var FORBIDDEN = (reason) => ({ ok: false, kind: "forbidden", reason });
var REJECTED = (reason) => ({ ok: false, kind: "rejected", reason });
var CONFLICT = { ok: false, kind: "conflict", reason: "state changed, refetch and retry" };
function eliminationsDiff(pre, post) {
  const wasEliminated = new Map(pre.map((p) => [p.id, p.isEliminated]));
  return post.filter((p) => p.isEliminated && !wasEliminated.get(p.id)).map((p) => ({ enginePlayerId: p.id }));
}
function turnDeadlineFor(state, now) {
  return state.isFinished ? null : now + TURN_TIMEOUT_MS;
}
function buildApplyTurnArgs(gameId, loaded, next, now) {
  const diff = diffDisputes(loaded.gameState.combatDisputes, next.combatDisputes, gameId);
  return {
    expected: {
      stateVersion: loaded.stateVersion,
      turnNumber: loaded.turnNumber,
      currentPlayerId: loaded.currentPlayerId
    },
    next: {
      gameState: next,
      turnNumber: next.turnNumber,
      currentPlayerId: next.currentPlayerId,
      isFinished: next.isFinished,
      winnerId: next.winner,
      turnDeadline: turnDeadlineFor(next, now)
    },
    disputeInserts: diff.inserts,
    disputeStatusUpdates: diff.statusUpdates,
    playerEliminations: eliminationsDiff(loaded.gameState.players, next.players)
  };
}
async function submitAction(repo, params) {
  const { gameId, userId, action, now } = params;
  const loaded = await repo.loadGame(gameId);
  if (!loaded) return NOT_FOUND("game not found");
  if (loaded.isFinished) return REJECTED("game is finished");
  if (userId !== loaded.currentPlayerId) return FORBIDDEN("not your turn");
  const res = applyAction(loaded.gameState, userId, action, now, FULL_HOOKS);
  if (!res.ok) return REJECTED(res.reason);
  const args = buildApplyTurnArgs(gameId, loaded, res.state, now);
  const committed = await repo.applyTurn(gameId, args);
  return committed ? { ok: true, state: res.state } : CONFLICT;
}
async function resolveDispute(repo, params) {
  const { gameId, userId, disputeId, now } = params;
  const loaded = await repo.loadGame(gameId);
  if (!loaded) return NOT_FOUND("game not found");
  const dispute = loaded.gameState.combatDisputes.find((d) => d.id === disputeId);
  if (!dispute) return NOT_FOUND("dispute not found");
  if (userId !== dispute.attackerPlayerId && userId !== dispute.defenderPlayerId) {
    return FORBIDDEN("not a party to this dispute");
  }
  const res = resolveDisputeByAction(loaded.gameState, disputeId, userId, now);
  if (!res.ok) return REJECTED(res.reason);
  const next = res.state;
  const diff = diffDisputes(loaded.gameState.combatDisputes, next.combatDisputes, gameId);
  const committed = await repo.resolveDisputeCas(gameId, {
    expected: {
      stateVersion: loaded.stateVersion,
      turnNumber: loaded.turnNumber,
      currentPlayerId: loaded.currentPlayerId
    },
    disputeId,
    newStatus: "resolvedByAction",
    next: { gameState: next },
    disputeStatusUpdates: diff.statusUpdates.filter((u) => u.id !== disputeId),
    playerEliminations: eliminationsDiff(loaded.gameState.players, next.players)
  });
  return committed ? { ok: true, state: next } : CONFLICT;
}
function foldActions(state, playerId, actions, now) {
  let s = state;
  for (const action of actions) {
    const res = applyAction(s, playerId, action, now, FULL_HOOKS);
    if (!res.ok) return null;
    s = res.state;
  }
  return s;
}
async function sweepTimeouts(repo, params) {
  const { now } = params;
  const summary = { turnsAdvanced: 0, disputesResolved: 0, conflicts: 0 };
  for (const { gameId } of await repo.findTimedOutTurns(now)) {
    const loaded = await repo.loadGame(gameId);
    if (!loaded || loaded.isFinished) continue;
    const actions = decideSubstituteTurn(loaded.gameState, loaded.currentPlayerId, now);
    if (actions.length === 0) continue;
    const next = foldActions(loaded.gameState, loaded.currentPlayerId, actions, now);
    if (!next) continue;
    const args = buildApplyTurnArgs(gameId, loaded, next, now);
    const committed = await repo.applyTurn(gameId, args);
    if (committed) summary.turnsAdvanced++;
    else summary.conflicts++;
  }
  for (const { gameId, disputeId } of await repo.findExpiredDisputes(now)) {
    const loaded = await repo.loadGame(gameId);
    if (!loaded) continue;
    const dispute = loaded.gameState.combatDisputes.find((d) => d.id === disputeId);
    if (!dispute || dispute.status !== "pending") continue;
    const next = resolveTimedOutDispute(dispute, loaded.gameState);
    const updated = {
      ...next,
      combatDisputes: next.combatDisputes.map(
        (d) => d.id === disputeId ? { ...d, status: "resolvedByTimeout" /* ResolvedByTimeout */ } : d
      )
    };
    const diff = diffDisputes(loaded.gameState.combatDisputes, updated.combatDisputes, gameId);
    const committed = await repo.resolveDisputeCas(gameId, {
      expected: {
        stateVersion: loaded.stateVersion,
        turnNumber: loaded.turnNumber,
        currentPlayerId: loaded.currentPlayerId
      },
      disputeId,
      newStatus: "resolvedByTimeout",
      next: { gameState: updated },
      disputeStatusUpdates: diff.statusUpdates.filter((u) => u.id !== disputeId),
      playerEliminations: eliminationsDiff(loaded.gameState.players, updated.players)
    });
    if (committed) summary.disputesResolved++;
    else summary.conflicts++;
  }
  return summary;
}
export {
  ACTIVE_DEFENSE_BONUS,
  BASE_FOOD_PER_POP,
  BASE_GOLD_PER_POP,
  BASE_PRODUCTION_PER_POP,
  CITY_VISION_RADIUS,
  COMBAT_TIMEOUT_MS,
  CitySpecialization,
  CombatDisputeStatus,
  DEVELOPMENT_POINTS_PER_LEVEL,
  DiplomaticProposalStatus,
  Era,
  FOOD_PER_POPULATION_GROWTH,
  LEVEL_BONUS_PER_LEVEL,
  MIN_DAMAGE,
  POPULATION_POINTS_PER_POP,
  ResourceType,
  TERRITORY_POINTS_PER_CITY,
  TURN_TIMEOUT_MS,
  TerrainType,
  TurnState,
  UNIT_VISION_RADIUS,
  UnitType,
  activePlayers,
  applyAction,
  applyGrowth,
  canSubmitAction,
  computeCityProduction,
  computePlayerScore,
  computeVisibleHexes,
  createCombatDispute,
  decideOpponentTurn,
  decideSubstituteTurn,
  determineWinner,
  diffDisputes,
  eliminatePlayersWithNoCities,
  endTurn,
  generateMap,
  getCurrentPlayer,
  getPlayerById,
  growthThreshold,
  haveMadeContact,
  hexDistance,
  hexKey,
  hexNeighbors,
  hexesInRadius,
  isFavorableAttack,
  nextActivePlayerId,
  processTurnEconomy,
  proposeNonAggressionPact,
  proposeResourceTrade,
  rankPlayers,
  resolveCombat,
  resolveDispute,
  resolveDisputeByAction,
  resolveTimedOutDispute,
  respondToNonAggressionPact,
  respondToResourceTrade,
  submitAction,
  sweepTimeouts,
  terrainAt,
  terrainDefenseBonus,
  updateFogOfWar,
  validateAction
};
