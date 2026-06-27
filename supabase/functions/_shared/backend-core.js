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
var CitySpecialization = /* @__PURE__ */ ((CitySpecialization3) => {
  CitySpecialization3["Military"] = "military";
  CitySpecialization3["Commercial"] = "commercial";
  CitySpecialization3["Scientific"] = "scientific";
  return CitySpecialization3;
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
  UnitType2["Settler"] = "settler";
  UnitType2["Cavalry"] = "cavalry";
  UnitType2["Catapult"] = "catapult";
  UnitType2["Knight"] = "knight";
  UnitType2["Crossbowman"] = "crossbowman";
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
var BuildingType = /* @__PURE__ */ ((BuildingType3) => {
  BuildingType3["Barracks"] = "barracks";
  BuildingType3["Wall"] = "wall";
  BuildingType3["Market"] = "market";
  BuildingType3["Port"] = "port";
  BuildingType3["Library"] = "library";
  BuildingType3["Temple"] = "temple";
  return BuildingType3;
})(BuildingType || {});

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
var SMOOTH_PASSES = 2;
var COAST_WEIGHT = 0.55;
var WATER_LEVEL = 0.3;
var MOUNTAIN_LEVEL = 0.72;
var HILLS_LEVEL = 0.6;
var FOREST_MOISTURE = 0.55;
function smoothField(values, onMapKeys, passes) {
  let field = new Map(values);
  for (let p = 0; p < passes; p++) {
    const next = /* @__PURE__ */ new Map();
    for (const [key, coord] of keyedCoords(field)) {
      let sum = field.get(key);
      let count = 1;
      for (const n of hexNeighbors(coord)) {
        const nk = hexKey(n);
        if (onMapKeys.has(nk)) {
          sum += field.get(nk);
          count++;
        }
      }
      next.set(key, sum / count);
    }
    field = next;
  }
  return field;
}
function keyedCoords(field) {
  return Array.from(field.keys()).map((key) => {
    const [q, r] = key.split(",").map(Number);
    return [key, { q, r }];
  });
}
function normalize01(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values.values()) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  const out = /* @__PURE__ */ new Map();
  for (const [key, v] of values) {
    out.set(key, span > 1e-9 ? (v - min) / span : 0.5);
  }
  return out;
}
function classifyTerrain(elevation, moisture) {
  if (elevation < WATER_LEVEL) return "water" /* Water */;
  if (elevation > MOUNTAIN_LEVEL) return "mountain" /* Mountain */;
  if (elevation > HILLS_LEVEL) return "hills" /* Hills */;
  if (moisture > FOREST_MOISTURE) return "forest" /* Forest */;
  return "plains" /* Plains */;
}
function generateTerrain(allCoords, radius, rng) {
  const onMapKeys = new Set(allCoords.map(hexKey));
  const elev0 = /* @__PURE__ */ new Map();
  for (const c of allCoords) elev0.set(hexKey(c), rng());
  const moist0 = /* @__PURE__ */ new Map();
  for (const c of allCoords) moist0.set(hexKey(c), rng());
  const elev = normalize01(smoothField(elev0, onMapKeys, SMOOTH_PASSES));
  const moist = normalize01(smoothField(moist0, onMapKeys, SMOOTH_PASSES));
  const center = { q: 0, r: 0 };
  const terrain = /* @__PURE__ */ new Map();
  for (const c of allCoords) {
    const key = hexKey(c);
    const edgeFactor = radius > 0 ? hexDistance(c, center) / radius : 0;
    const elevation = elev.get(key) * (1 - COAST_WEIGHT) + (1 - edgeFactor) * COAST_WEIGHT;
    terrain.set(key, classifyTerrain(elevation, moist.get(key)));
  }
  const snapshot = new Map(terrain);
  for (const c of allCoords) {
    const key = hexKey(c);
    if (snapshot.get(key) !== "mountain" /* Mountain */) continue;
    const hasHighNeighbor = hexNeighbors(c).some((n) => {
      const t = snapshot.get(hexKey(n));
      return t === "mountain" /* Mountain */ || t === "hills" /* Hills */;
    });
    if (!hasHighNeighbor) terrain.set(key, "hills" /* Hills */);
  }
  const snapshot2 = new Map(terrain);
  for (const c of allCoords) {
    const key = hexKey(c);
    if (snapshot2.get(key) !== "forest" /* Forest */) continue;
    const touchesWater = hexNeighbors(c).some((n) => snapshot2.get(hexKey(n)) === "water" /* Water */);
    if (touchesWater) terrain.set(key, "plains" /* Plains */);
  }
  return terrain;
}
function findStartPositions(tiles, playerCount, mapRadius, rng) {
  const tileMap = /* @__PURE__ */ new Map();
  for (const tile of tiles) tileMap.set(hexKey(tile.coord), tile);
  const isValid = (coord) => {
    const tile = tileMap.get(hexKey(coord));
    return tile !== void 0 && tile.terrainType !== "water" /* Water */ && tile.terrainType !== "mountain" /* Mountain */;
  };
  const slots = Array.from({ length: playerCount }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const ringRadius = Math.round(mapRadius * 0.7);
  const taken = /* @__PURE__ */ new Set();
  const positions = [];
  for (let i = 0; i < playerCount; i++) {
    const slotAngle = 2 * Math.PI * slots[i] / playerCount;
    const jitter = (rng() - 0.5) * Math.PI / playerCount;
    const angle = slotAngle + jitter;
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
var MAP_SIZES = { small: 5, medium: 7, large: 10 };
function generateMap(radius, seed, playerCount) {
  const rng = createRng(seed);
  const allCoords = hexesInRadius({ q: 0, r: 0 }, radius);
  const terrain = generateTerrain(allCoords, radius, rng);
  const tiles = allCoords.map((coord) => ({
    coord,
    terrainType: terrain.get(hexKey(coord))
  }));
  return {
    tiles,
    radius,
    seed,
    startPositions: findStartPositions(tiles, playerCount, radius, rng)
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

// ../game-engine/src/buildings.ts
var CATALOG_ENTRIES = [
  // ── Military ─────────────────────────────────────────────────────────────
  {
    type: "barracks" /* Barracks */,
    name: "Quartel",
    specialization: "military" /* Military */,
    productionCost: 8,
    constructionTurns: 3,
    effect: { type: "productionMultiplier", value: 1.5 },
    description: "Aumenta a produ\xE7\xE3o da cidade em 50%. Treina unidades mais rapidamente."
  },
  {
    type: "wall" /* Wall */,
    name: "Muralha",
    specialization: "military" /* Military */,
    productionCost: 12,
    constructionTurns: 4,
    effect: { type: "cityDefenseBonus", value: 5 },
    description: "Concede +5 de defesa a todas as unidades dentro dos limites da cidade."
  },
  // ── Commercial ───────────────────────────────────────────────────────────
  {
    type: "market" /* Market */,
    name: "Mercado",
    specialization: "commercial" /* Commercial */,
    productionCost: 10,
    constructionTurns: 2,
    effect: { type: "goldMultiplier", value: 1.5 },
    description: "Aumenta a produ\xE7\xE3o de ouro em 50%."
  },
  {
    type: "port" /* Port */,
    name: "Porto",
    specialization: "commercial" /* Commercial */,
    productionCost: 15,
    constructionTurns: 3,
    effect: { type: "foodMultiplier", value: 1.3 },
    description: "Rede de pesca costeira \u2014 aumenta a produ\xE7\xE3o de alimento em 30%."
  },
  // ── Scientific ───────────────────────────────────────────────────────────
  {
    type: "library" /* Library */,
    name: "Biblioteca",
    specialization: "scientific" /* Scientific */,
    productionCost: 10,
    constructionTurns: 3,
    effect: { type: "eraProgressBonus", value: 1 },
    description: "Gera 1 ponto de pesquisa por turno, acelerando a progress\xE3o de era."
  },
  {
    type: "temple" /* Temple */,
    name: "Templo",
    specialization: "scientific" /* Scientific */,
    productionCost: 10,
    constructionTurns: 4,
    effect: { type: "scoreBonus", value: 10 },
    description: "Concede +10 pontos de pontua\xE7\xE3o cultural ao final da partida."
  }
];
var BUILDING_CATALOG = new Map(
  CATALOG_ENTRIES.map((d) => [d.type, d])
);
function getBuildingDef(type) {
  const def = BUILDING_CATALOG.get(type);
  if (!def) throw new Error(`Unknown BuildingType: ${type}`);
  return def;
}
function getBuildingsBySpecialization(spec) {
  return CATALOG_ENTRIES.filter((d) => d.specialization === spec);
}
function canBuildBuilding(city, type) {
  const def = getBuildingDef(type);
  if (def.specialization !== city.specialization) return false;
  if ((city.buildings ?? []).includes(type)) return false;
  if (city.construction != null) return false;
  return true;
}
function startConstruction(city, type) {
  const def = getBuildingDef(type);
  return {
    ...city,
    construction: {
      buildingType: type,
      turnsRemaining: def.constructionTurns,
      totalTurns: def.constructionTurns
    }
  };
}
function tickConstruction(city) {
  if (!city.construction) return city;
  const remaining = city.construction.turnsRemaining - 1;
  if (remaining <= 0) {
    return {
      ...city,
      buildings: [...city.buildings ?? [], city.construction.buildingType],
      construction: null
    };
  }
  return {
    ...city,
    construction: { ...city.construction, turnsRemaining: remaining }
  };
}
function applyBuildingBonuses(buildings, resources) {
  let { gold, food, production } = resources;
  for (const type of buildings) {
    const e = getBuildingDef(type).effect;
    switch (e.type) {
      case "goldMultiplier":
        gold = Math.round(gold * e.value);
        break;
      case "foodMultiplier":
        food = Math.round(food * e.value);
        break;
      case "productionMultiplier":
        production = Math.round(production * e.value);
        break;
    }
  }
  return { gold, food, production };
}
function getCityDefenseBonus(buildings) {
  return buildings.reduce((sum, type) => {
    const e = getBuildingDef(type).effect;
    return e.type === "cityDefenseBonus" ? sum + e.value : sum;
  }, 0);
}
function getCityEraProgressBonus(buildings) {
  return buildings.reduce((sum, type) => {
    const e = getBuildingDef(type).effect;
    return e.type === "eraProgressBonus" ? sum + e.value : sum;
  }, 0);
}
function getCityScoreBonus(buildings) {
  return buildings.reduce((sum, type) => {
    const e = getBuildingDef(type).effect;
    return e.type === "scoreBonus" ? sum + e.value : sum;
  }, 0);
}

// ../game-engine/src/economy.ts
var BASE_GOLD_PER_POP = 1.5;
var BASE_FOOD_PER_POP = 2;
var BASE_PRODUCTION_PER_POP = 1.5;
var UNIT_MAINTENANCE_GOLD = 1;
function applyUnitMaintenance(gold, unitCount) {
  const after = gold - unitCount * UNIT_MAINTENANCE_GOLD;
  return { gold: Math.max(0, after), underMaintenance: after < 0 };
}
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
var TERRAIN_RESOURCE_BONUS = {
  ["plains" /* Plains */]: { gold: 0, food: 2, production: 0 },
  ["forest" /* Forest */]: { gold: 0, food: 0, production: 2 },
  ["hills" /* Hills */]: { gold: 1, food: 0, production: 1 },
  ["mountain" /* Mountain */]: { gold: 0, food: 0, production: 0 },
  ["water" /* Water */]: { gold: 0, food: 0, production: 0 }
};
function computeCityTerritoryBonus(city, allCities, tiles, radius = 2) {
  const tileByKey = /* @__PURE__ */ new Map();
  for (const t of tiles) tileByKey.set(hexKey(t.coord), t);
  const bonus = { gold: 0, food: 0, production: 0 };
  for (const coord of hexesInRadius(city.position, radius)) {
    const tile = tileByKey.get(hexKey(coord));
    if (!tile) continue;
    let owner = city;
    for (const other of allCities) {
      if (other.id === city.id) continue;
      const dOther = hexDistance(other.position, coord);
      const dOwner = hexDistance(owner.position, coord);
      if (dOther < dOwner || dOther === dOwner && other.id < owner.id) {
        owner = other;
      }
    }
    if (owner.id !== city.id) continue;
    const yld = TERRAIN_RESOURCE_BONUS[tile.terrainType];
    bonus.gold += yld.gold;
    bonus.food += yld.food;
    bonus.production += yld.production;
  }
  return bonus;
}
function computeCityProduction(city, allCities = [], tiles = []) {
  if (city.population === 0) return { gold: 0, food: 0, production: 0 };
  const m = SPECIALIZATION_MULTIPLIERS[city.specialization];
  const lv = 1 + (city.level - 1) * LEVEL_BONUS_PER_LEVEL;
  const base = {
    gold: Math.round(city.population * BASE_GOLD_PER_POP * m.gold * lv),
    food: Math.round(city.population * BASE_FOOD_PER_POP * m.food * lv),
    production: Math.round(city.population * BASE_PRODUCTION_PER_POP * m.production * lv)
  };
  if (tiles.length > 0) {
    const terr = computeCityTerritoryBonus(city, allCities, tiles);
    base.gold += terr.gold;
    base.food += terr.food;
    base.production += terr.production;
  }
  return applyBuildingBonuses(city.buildings ?? [], base);
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
function processTurnEconomy(cities, existingResources, tiles = []) {
  let gold = existingResources.gold;
  let food = existingResources.food;
  let production = existingResources.production;
  const updatedCities = [];
  for (const city of cities) {
    const produced = computeCityProduction(city, cities, tiles);
    gold += produced.gold;
    food += produced.food;
    production += produced.production;
    const grown = applyGrowth(city, produced.food);
    updatedCities.push(tickConstruction(grown));
  }
  return {
    updatedCities,
    updatedResources: { gold, food, production }
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
function scorePlayer(state, playerId) {
  return computePlayerScore(playerId, state.cities);
}
function scoreAll(state) {
  return Object.fromEntries(
    state.players.map((p) => [p.id, computePlayerScore(p.id, state.cities)])
  );
}
function rankPlayers(state) {
  return state.players.filter((p) => !p.isEliminated).map((p) => computePlayerScore(p.id, state.cities)).sort(
    (a, b) => b.total !== a.total ? b.total - a.total : a.playerId.localeCompare(b.playerId)
  );
}
function determineWinner(state) {
  const ranked = rankPlayers(state);
  if (ranked.length === 0) return null;
  if (ranked.length >= 2 && ranked[0].total === ranked[1].total) return null;
  return ranked[0].playerId;
}
function eliminatePlayersWithNoCities(state) {
  const toEliminate = state.players.filter(
    (p) => !p.isEliminated && !state.cities.some((c) => c.ownerId === p.id)
  );
  if (toEliminate.length === 0) return state;
  const eliminatedIds = new Set(toEliminate.map((p) => p.id));
  return {
    ...state,
    players: state.players.map(
      (p) => eliminatedIds.has(p.id) ? { ...p, isEliminated: true } : p
    ),
    units: state.units.filter((u) => !eliminatedIds.has(u.ownerId))
  };
}

// ../game-engine/src/units.ts
var ERA_ORDER = {
  ["ancient" /* Ancient */]: 0,
  ["classical" /* Classical */]: 1,
  ["medieval" /* Medieval */]: 2
};
var CATALOG_ENTRIES2 = [
  // ── Era Ancient ──────────────────────────────────────────────────────────
  {
    type: "warrior" /* Warrior */,
    name: "Guerreiro",
    eraRequired: "ancient" /* Ancient */,
    productionCost: 10,
    stats: { attack: 10, defense: 5, maxHp: 10, movement: 2 },
    canFoundCity: false,
    description: "Infantaria b\xE1sica. Corpo-a-corpo confi\xE1vel na era antiga."
  },
  {
    type: "archer" /* Archer */,
    name: "Arqueiro",
    eraRequired: "ancient" /* Ancient */,
    productionCost: 25,
    stats: { attack: 8, defense: 3, maxHp: 8, movement: 2, range: 2 },
    canFoundCity: false,
    description: "Ataque \xE0 dist\xE2ncia. Fraco em defesa pr\xF3xima."
  },
  {
    type: "settler" /* Settler */,
    name: "Colono",
    eraRequired: "ancient" /* Ancient */,
    productionCost: 40,
    stats: { attack: 0, defense: 1, maxHp: 6, movement: 2 },
    canFoundCity: true,
    description: "Funda novas cidades. In\xFAtil em combate \u2014 proteja-o."
  },
  // ── Era Classical ─────────────────────────────────────────────────────────
  {
    type: "cavalry" /* Cavalry */,
    name: "Cavalaria",
    eraRequired: "classical" /* Classical */,
    productionCost: 35,
    stats: { attack: 12, defense: 6, maxHp: 10, movement: 4 },
    canFoundCity: false,
    description: "Movimento alto \u2014 ideal para explora\xE7\xE3o e flanqueamento."
  },
  {
    type: "catapult" /* Catapult */,
    name: "Catapulta",
    eraRequired: "classical" /* Classical */,
    productionCost: 50,
    stats: { attack: 15, defense: 2, maxHp: 8, movement: 1, range: 2, cityAttackBonus: 8 },
    canFoundCity: false,
    description: "Lenta, mas devastadora contra cidades e guarni\xE7\xF5es."
  },
  // ── Era Medieval ──────────────────────────────────────────────────────────
  {
    type: "knight" /* Knight */,
    name: "Cavaleiro",
    eraRequired: "medieval" /* Medieval */,
    productionCost: 60,
    stats: { attack: 18, defense: 10, maxHp: 14, movement: 3 },
    canFoundCity: false,
    description: "A unidade corpo-a-corpo mais forte. Custa caro, vale cada produ\xE7\xE3o."
  },
  {
    type: "crossbowman" /* Crossbowman */,
    name: "Besteiro",
    eraRequired: "medieval" /* Medieval */,
    productionCost: 45,
    stats: { attack: 14, defense: 5, maxHp: 10, movement: 2, range: 2 },
    canFoundCity: false,
    description: "Arqueiro avan\xE7ado com mais ataque e resist\xEAncia."
  }
];
var UNIT_CATALOG = new Map(
  CATALOG_ENTRIES2.map((d) => [d.type, d])
);
function getUnitDef(type) {
  const def = UNIT_CATALOG.get(type);
  if (!def) throw new Error(`Unknown UnitType: ${type}`);
  return def;
}
function canTrainUnit(unitType, currentEra) {
  const def = getUnitDef(unitType);
  return ERA_ORDER[currentEra] >= ERA_ORDER[def.eraRequired];
}
function unitsAvailableInEra(era) {
  return CATALOG_ENTRIES2.filter((d) => canTrainUnit(d.type, era));
}
function createUnitInstance(id, type, ownerId, position) {
  const def = getUnitDef(type);
  return {
    id,
    unitType: type,
    position,
    ownerId,
    hasMoved: false,
    hasAttacked: false,
    canFoundCity: def.canFoundCity || void 0,
    stats: {
      attack: def.stats.attack,
      defense: def.stats.defense,
      hp: def.stats.maxHp,
      maxHp: def.stats.maxHp,
      movement: def.stats.movement,
      ...def.stats.range !== void 0 && { range: def.stats.range },
      ...def.stats.cityAttackBonus !== void 0 && { cityAttackBonus: def.stats.cityAttackBonus }
    }
  };
}
function createUnitFromDef(id, def, ownerId, position) {
  return {
    id,
    unitType: def.type,
    position,
    ownerId,
    hasMoved: false,
    hasAttacked: false,
    canFoundCity: def.canFoundCity || void 0,
    stats: {
      attack: def.stats.attack,
      defense: def.stats.defense,
      hp: def.stats.maxHp,
      maxHp: def.stats.maxHp,
      movement: def.stats.movement,
      ...def.stats.range !== void 0 && { range: def.stats.range },
      ...def.stats.cityAttackBonus !== void 0 && { cityAttackBonus: def.stats.cityAttackBonus }
    }
  };
}

// ../game-engine/src/civilizations.ts
var SPECIAL_UNITS = [
  // Roma — Warrior replacement: stronger defense and HP, slightly more attack
  {
    type: "roman_legionary",
    name: "Legion\xE1rio",
    eraRequired: "ancient" /* Ancient */,
    productionCost: 30,
    replacesType: "warrior" /* Warrior */,
    stats: { attack: 12, defense: 9, maxHp: 12, movement: 2 },
    canFoundCity: false,
    description: "Infantaria romana de elite. Discipline defensiva superior ao Guerreiro."
  },
  // Mongóis — Cavalry replacement: extra movement, slightly better stats
  {
    type: "mongol_cavalry",
    name: "Cavaleiro Mongol",
    eraRequired: "classical" /* Classical */,
    productionCost: 45,
    replacesType: "cavalry" /* Cavalry */,
    stats: { attack: 14, defense: 7, maxHp: 12, movement: 5 },
    canFoundCity: false,
    description: "Cavalaria das estepes. Movimenta-se mais r\xE1pido que qualquer unidade da era."
  },
  // Egito — Cavalry replacement: higher attack, lower defense
  {
    type: "egypt_war_chariot",
    name: "Carro de Guerra",
    eraRequired: "classical" /* Classical */,
    productionCost: 40,
    replacesType: "cavalry" /* Cavalry */,
    stats: { attack: 14, defense: 5, maxHp: 10, movement: 4 },
    canFoundCity: false,
    description: "Ve\xEDculo de combate veloz. Maior poder de ataque, menor resist\xEAncia."
  },
  // Grécia — Warrior replacement: muito mais defesa, ataque ligeiramente menor
  {
    type: "greek_hoplite",
    name: "Hoplita",
    eraRequired: "ancient" /* Ancient */,
    productionCost: 30,
    replacesType: "warrior" /* Warrior */,
    stats: { attack: 9, defense: 12, maxHp: 14, movement: 2 },
    canFoundCity: false,
    description: "Infantaria de forma\xE7\xE3o cerrada. Defesa excepcional, ataque contido."
  },
  // Vikings — Knight replacement: ataque devastador, defesa reduzida
  {
    type: "viking_berserker",
    name: "Berserker",
    eraRequired: "medieval" /* Medieval */,
    productionCost: 70,
    replacesType: "knight" /* Knight */,
    stats: { attack: 24, defense: 8, maxHp: 14, movement: 3 },
    canFoundCity: false,
    description: "Guerreiro em transe de batalha. Ataque excepcional; sem escudo."
  },
  // China — Crossbowman replacement: mais movimento, range mantido
  {
    type: "china_horse_archer",
    name: "Arqueiro de Cavalo",
    eraRequired: "medieval" /* Medieval */,
    productionCost: 55,
    replacesType: "crossbowman" /* Crossbowman */,
    stats: { attack: 15, defense: 6, maxHp: 12, movement: 3, range: 2 },
    canFoundCity: false,
    description: "Arqueiro montado. Combina mobilidade de cavalaria com alcance de besteiro."
  }
];
var SPECIAL_UNIT_CATALOG = new Map(
  SPECIAL_UNITS.map((u) => [u.type, u])
);
var CATALOG_ENTRIES3 = [
  {
    id: "romans",
    name: "Romanos",
    description: "Mestres da engenharia e infraestrutura. Cidades produzem mais em menos tempo.",
    abilities: [
      {
        id: "roman_infrastructure",
        name: "Infraestrutura Imperial",
        description: "+25% de produ\xE7\xE3o em todas as cidades.",
        effect: { type: "productionBonus", multiplier: 1.25 }
      }
    ],
    specialUnitType: "roman_legionary"
  },
  {
    id: "mongols",
    name: "Mong\xF3is",
    description: "Conquistadores das estepes. Combate feroz e vis\xE3o ampla do terreno.",
    abilities: [
      {
        id: "mongol_fury",
        name: "F\xFAria das Estepes",
        description: "+20% de dano em combate.",
        effect: { type: "combatBonus", multiplier: 1.2 }
      },
      {
        id: "mongol_scouting",
        name: "Explora\xE7\xE3o N\xF4made",
        description: "+1 hex de vis\xE3o para todas as unidades.",
        effect: { type: "visionBonus", extraRadius: 1 }
      }
    ],
    specialUnitType: "mongol_cavalry"
  },
  {
    id: "egyptians",
    name: "Eg\xEDpcios",
    description: "Civiliza\xE7\xE3o do Nilo. Abund\xE2ncia agr\xEDcola alimenta grandes popula\xE7\xF5es.",
    abilities: [
      {
        id: "egypt_nile_bounty",
        name: "Fartura do Nilo",
        description: "+30% de produ\xE7\xE3o de comida em todas as cidades.",
        effect: { type: "foodBonus", multiplier: 1.3 }
      }
    ],
    specialUnitType: "egypt_war_chariot"
  },
  {
    id: "greeks",
    name: "Gregos",
    description: "Fil\xF3sofos e estrategistas. Vis\xE3o agu\xE7ada e t\xE1ticas defensivas superiores.",
    abilities: [
      {
        id: "greek_philosophy",
        name: "Filosofia Militar",
        description: "+10% de dano em combate (t\xE1ticas superiores).",
        effect: { type: "combatBonus", multiplier: 1.1 }
      },
      {
        id: "greek_culture",
        name: "Cultura Hel\xEAnica",
        description: "+1 hex de vis\xE3o (conhecimento geogr\xE1fico amplo).",
        effect: { type: "visionBonus", extraRadius: 1 }
      }
    ],
    specialUnitType: "greek_hoplite"
  },
  {
    id: "vikings",
    name: "Vikings",
    description: "Guerreiros do norte. Brutais em combate e tem\xEDveis exploradores.",
    abilities: [
      {
        id: "viking_raid",
        name: "Incurs\xE3o N\xF3rdica",
        description: "+15% de dano em combate.",
        effect: { type: "combatBonus", multiplier: 1.15 }
      },
      {
        id: "viking_exploration",
        name: "Esp\xEDrito Explorador",
        description: "+2 hexes de vis\xE3o para todas as unidades.",
        effect: { type: "visionBonus", extraRadius: 2 }
      }
    ],
    specialUnitType: "viking_berserker"
  },
  {
    id: "china",
    name: "China",
    description: "Pot\xEAncia comercial e tecnol\xF3gica. Ouro flui abundantemente.",
    abilities: [
      {
        id: "china_silk_road",
        name: "Rota da Seda",
        description: "+25% de produ\xE7\xE3o de ouro em todas as cidades.",
        effect: { type: "goldBonus", multiplier: 1.25 }
      }
    ],
    specialUnitType: "china_horse_archer"
  }
];
var CIVILIZATION_CATALOG = new Map(
  CATALOG_ENTRIES3.map((c) => [c.id, c])
);
function getCivilization(id) {
  const civ = CIVILIZATION_CATALOG.get(id);
  if (!civ) throw new Error(`Unknown civilization: ${id}`);
  return civ;
}
function getSpecialUnit(civId) {
  const civ = getCivilization(civId);
  const unit = SPECIAL_UNIT_CATALOG.get(civ.specialUnitType);
  if (!unit) throw new Error(`Missing special unit definition: ${civ.specialUnitType}`);
  return unit;
}
function unitsForCiv(civId, era) {
  const special = getSpecialUnit(civId);
  const baseAvailable = unitsAvailableInEra(era);
  const replacedIsAvailable = baseAvailable.some((u) => u.type === special.replacesType);
  const filtered = baseAvailable.filter((u) => u.type !== special.replacesType);
  return replacedIsAvailable ? [...filtered, special] : filtered;
}
function getCivEconomyMultipliers(civId) {
  try {
    const civ = getCivilization(civId);
    let gold = 1, food = 1, production = 1;
    for (const ability of civ.abilities) {
      const e = ability.effect;
      if (e.type === "goldBonus") gold *= e.multiplier;
      if (e.type === "foodBonus") food *= e.multiplier;
      if (e.type === "productionBonus") production *= e.multiplier;
    }
    return { gold, food, production };
  } catch {
    return { gold: 1, food: 1, production: 1 };
  }
}
function getCivCombatMultiplier(civId) {
  try {
    const civ = getCivilization(civId);
    return civ.abilities.filter((a) => a.effect.type === "combatBonus").reduce((acc, a) => {
      const e = a.effect;
      return acc * e.multiplier;
    }, 1);
  } catch {
    return 1;
  }
}
function getCivVisionBonus(civId) {
  try {
    const civ = getCivilization(civId);
    return civ.abilities.reduce((sum, a) => {
      const e = a.effect;
      return e.type === "visionBonus" ? sum + e.extraRadius : sum;
    }, 0);
  } catch {
    return 0;
  }
}

// ../game-engine/src/turn.ts
var ERA_ORDER2 = ["ancient" /* Ancient */, "classical" /* Classical */, "medieval" /* Medieval */];
var ERA_SCIENCE_THRESHOLDS = [5, 5];
var ERA_ORDER_ARRAY = ERA_ORDER2;
var ERA_SCIENCE_THRESHOLDS_ARRAY = ERA_SCIENCE_THRESHOLDS;
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
  let actorUnderMaintenance = false;
  const actor = players.find((p) => p.id === actorId);
  if (actor) {
    const actorCities = cities.filter((c) => c.ownerId === actorId);
    const preResources = { ...actor.resources };
    const { updatedCities, updatedResources } = processTurnEconomy(actorCities, actor.resources, state.map.tiles);
    const updatedById = new Map(updatedCities.map((c) => [c.id, c]));
    cities = cities.map((c) => updatedById.get(c.id) ?? c);
    const m = getCivEconomyMultipliers(actor.civilizationId);
    actor.resources = {
      gold: Math.round(preResources.gold + (updatedResources.gold - preResources.gold) * m.gold),
      food: Math.round(preResources.food + (updatedResources.food - preResources.food) * m.food),
      production: Math.round(preResources.production + (updatedResources.production - preResources.production) * m.production)
    };
    const actorUnitCount = state.units.filter((u) => u.ownerId === actorId).length;
    const maint = applyUnitMaintenance(actor.resources.gold, actorUnitCount);
    actor.resources = { ...actor.resources, gold: maint.gold };
    actorUnderMaintenance = maint.underMaintenance;
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
    const winner = hooks.determineWinner ? hooks.determineWinner(working) : determineWinner(working);
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
  const units = state.units.map((u) => {
    if (u.ownerId === actorId) return { ...u, isUnderMaintenance: actorUnderMaintenance };
    if (u.ownerId === nextId) return { ...u, hasMoved: false, hasAttacked: false, isUnderMaintenance: false };
    return u;
  });
  const nextCities = working.cities.map(
    (c) => c.ownerId === nextId ? { ...c, hp: Math.min(c.maxHp ?? 10, (c.hp ?? 10) + 1), maxHp: c.maxHp ?? 10 } : c
  );
  let nextFogOfWar = working.fogOfWar;
  if (nextId) {
    const nextFogEntry = working.fogOfWar.find((f) => f.playerId === nextId);
    if (nextFogEntry) {
      const nextPlayerUnits = units.filter((u) => u.ownerId === nextId);
      const nextPlayerCities = nextCities.filter((c) => c.ownerId === nextId);
      const updatedFog = updateFogOfWar(nextFogEntry, nextPlayerUnits, nextPlayerCities, state.map.radius);
      nextFogOfWar = working.fogOfWar.map((f) => f.playerId === nextId ? updatedFog : f);
    }
  }
  const eraIdx = ERA_ORDER2.indexOf(working.era);
  let nextEra = working.era;
  let nextEraProgress = working.eraProgress ?? 0;
  if (eraIdx >= 0 && eraIdx < ERA_ORDER2.length - 1) {
    const threshold = ERA_SCIENCE_THRESHOLDS[eraIdx];
    const actorCities = working.cities.filter((c) => c.ownerId === actorId);
    const science = 1 + actorCities.reduce(
      (s, c) => s + getCityEraProgressBonus(c.buildings ?? []),
      0
    );
    nextEraProgress += science;
    if (nextEraProgress >= threshold) {
      nextEra = ERA_ORDER2[eraIdx + 1];
      nextEraProgress -= threshold;
    }
  }
  return {
    ok: true,
    state: {
      ...working,
      units,
      cities: nextCities,
      fogOfWar: nextFogOfWar,
      era: nextEra,
      eraProgress: nextEraProgress,
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
  const defenderDefense = defender.stats.defense + terrainDefenseBonus(opts.defenderTerrain) + (activeDefense ? ACTIVE_DEFENSE_BONUS : 0) - (defender.isUnderMaintenance ? 1 : 0);
  const attackMult = opts.attackerCivMultiplier ?? 1;
  const damageToDefender = Math.max(MIN_DAMAGE, Math.floor(attacker.stats.attack * attackMult) - defenderDefense);
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
  const attackerDefense = attacker.stats.defense + terrainDefenseBonus(attackerTerrain) - (attacker.isUnderMaintenance ? 1 : 0);
  const defMult = opts.defenderCivMultiplier ?? 1;
  const damageToAttacker = Math.max(MIN_DAMAGE, Math.floor(defender.stats.attack * defMult) - attackerDefense);
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
  const atkPlayer = state.players.find((p) => p.id === dispute.attackerPlayerId);
  const defPlayer = state.players.find((p) => p.id === dispute.defenderPlayerId);
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: actingPlayerId === dispute.defenderPlayerId,
    attackerCivMultiplier: atkPlayer ? getCivCombatMultiplier(atkPlayer.civilizationId) : 1,
    defenderCivMultiplier: defPlayer ? getCivCombatMultiplier(defPlayer.civilizationId) : 1
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
  const atkPlayer = state.players.find((p) => p.id === dispute.attackerPlayerId);
  const defPlayer = state.players.find((p) => p.id === dispute.defenderPlayerId);
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: false,
    attackerCivMultiplier: atkPlayer ? getCivCombatMultiplier(atkPlayer.civilizationId) : 1,
    defenderCivMultiplier: defPlayer ? getCivCombatMultiplier(defPlayer.civilizationId) : 1
  });
  return applyCombatResult(state, result);
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
function hasWar(state, aId, bId) {
  return (state.wars ?? []).some(
    (w) => w.declarerId === aId && w.targetId === bId || w.declarerId === bId && w.targetId === aId
  );
}
function isPair(proposerId, targetId, aId, bId) {
  return proposerId === aId && targetId === bId || proposerId === bId && targetId === aId;
}
function relationBetween(state, aId, bId) {
  if (hasExistingPact(state, aId, bId)) return "pact";
  if (hasWar(state, aId, bId)) return "war";
  return "neutral";
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
    createdAtTurn: state.turnNumber,
    kind: "pact"
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
    kind: "trade",
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
function cancelProposalsBetween(state, aId, bId) {
  return state.diplomaticProposals.map(
    (p) => p.status === "pending" /* Pending */ && isPair(p.proposerId, p.targetId, aId, bId) ? { ...p, status: "rejected" /* Rejected */ } : p
  );
}
function declareWar(state, declarerId, targetId) {
  if (!isActive(state, declarerId)) {
    return { ok: false, reason: "declarer is not an active player", state };
  }
  if (!isActive(state, targetId)) {
    return { ok: false, reason: "target is not an active player", state };
  }
  if (declarerId === targetId) {
    return { ok: false, reason: "cannot declare war on yourself", state };
  }
  if (!haveMadeContact(state, declarerId, targetId)) {
    return { ok: false, reason: "no contact established between players", state };
  }
  if (hasWar(state, declarerId, targetId)) {
    return { ok: false, reason: "already at war", state };
  }
  const war = {
    id: `war:${declarerId}:${targetId}:${state.turnNumber}`,
    declarerId,
    targetId,
    declaredAtTurn: state.turnNumber
  };
  const remainingPacts = state.nonAggressionPacts.filter(
    (p) => !isPair(p.proposerId, p.acceptorId, declarerId, targetId)
  );
  return {
    ok: true,
    state: {
      ...state,
      nonAggressionPacts: remainingPacts,
      wars: [...state.wars ?? [], war],
      diplomaticProposals: cancelProposalsBetween(state, declarerId, targetId)
    }
  };
}
function breakNonAggressionPact(state, breakerId, targetId) {
  if (!hasExistingPact(state, breakerId, targetId)) {
    return { ok: false, reason: "no non-aggression pact to break", state };
  }
  const remainingPacts = state.nonAggressionPacts.filter(
    (p) => !isPair(p.proposerId, p.acceptorId, breakerId, targetId)
  );
  return { ok: true, state: { ...state, nonAggressionPacts: remainingPacts } };
}
function hasPendingPeace(state, aId, bId) {
  return state.diplomaticProposals.some(
    (p) => p.status === "pending" /* Pending */ && p.kind === "peace" && isPair(p.proposerId, p.targetId, aId, bId)
  );
}
function proposePeace(state, proposerId, targetId) {
  if (!isActive(state, proposerId)) {
    return { ok: false, reason: "proposer is not an active player", state };
  }
  if (!isActive(state, targetId)) {
    return { ok: false, reason: "target is not an active player", state };
  }
  if (!hasWar(state, proposerId, targetId)) {
    return { ok: false, reason: "players are not at war", state };
  }
  if (hasPendingPeace(state, proposerId, targetId)) {
    return { ok: false, reason: "a pending peace proposal already exists", state };
  }
  const proposal = {
    id: `peace:${proposerId}:${targetId}:${state.turnNumber}`,
    proposerId,
    targetId,
    status: "pending" /* Pending */,
    createdAtTurn: state.turnNumber,
    kind: "peace"
  };
  return {
    ok: true,
    state: { ...state, diplomaticProposals: [...state.diplomaticProposals, proposal] }
  };
}
function respondToPeace(state, responderId, proposalId, accept) {
  const proposal = state.diplomaticProposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: "proposal not found", state };
  if (proposal.kind !== "peace") return { ok: false, reason: "proposal is not a peace offer", state };
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
  const remainingWars = (state.wars ?? []).filter(
    (w) => !isPair(w.declarerId, w.targetId, proposal.proposerId, responderId)
  );
  return {
    ok: true,
    state: { ...state, diplomaticProposals: updatedProposals, wars: remainingWars }
  };
}
function respondToProposal(state, responderId, proposalId, accept) {
  const proposal = state.diplomaticProposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false, reason: "proposal not found", state };
  const kind = proposal.kind ?? (proposal.terms ? "trade" : "pact");
  switch (kind) {
    case "trade":
      return respondToResourceTrade(state, responderId, proposalId, accept);
    case "peace":
      return respondToPeace(state, responderId, proposalId, accept);
    case "pact":
    default:
      return respondToNonAggressionPact(state, responderId, proposalId, accept);
  }
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
      if (relationBetween(state, playerId, defender.ownerId) === "pact") {
        return { valid: false, reason: "non-aggression pact prevents this attack" };
      }
      const alreadyDisputing = state.combatDisputes.some(
        (d) => d.status === "pending" /* Pending */ && d.attackerUnitId === attacker.id
      );
      if (alreadyDisputing) {
        return { valid: false, reason: "unit already has a pending dispute" };
      }
      return { valid: true };
    }
    case "trainUnit": {
      const city = state.cities.find((c) => c.id === action.cityId);
      if (!city) return { valid: false, reason: "city not found" };
      if (city.ownerId !== playerId) return { valid: false, reason: "not your city" };
      const player = getPlayerById(state, playerId);
      const allUnits = unitsForCiv(player.civilizationId, state.era);
      const unitDef = allUnits.find((u) => u.type === action.unitType);
      if (!unitDef) return { valid: false, reason: "unit not available in this era" };
      if (player.resources.production < unitDef.productionCost) {
        return { valid: false, reason: "insufficient production" };
      }
      const alreadyThere = state.units.some(
        (u) => u.ownerId === playerId && hexKey(u.position) === hexKey(city.position)
      );
      if (alreadyThere) return { valid: false, reason: "city hex occupied" };
      return { valid: true };
    }
    case "constructBuilding": {
      const city = state.cities.find((c) => c.id === action.cityId);
      if (!city) return { valid: false, reason: "city not found" };
      if (city.ownerId !== playerId) return { valid: false, reason: "not your city" };
      const buildingDef = getBuildingDef(action.buildingType);
      if (buildingDef.specialization !== city.specialization) {
        return { valid: false, reason: "wrong city specialization" };
      }
      if ((city.buildings ?? []).includes(action.buildingType)) {
        return { valid: false, reason: "building already constructed" };
      }
      if (city.construction != null) {
        return { valid: false, reason: "construction already in progress" };
      }
      const player = getPlayerById(state, playerId);
      if (player.resources.production < buildingDef.productionCost) {
        return { valid: false, reason: "insufficient production" };
      }
      return { valid: true };
    }
    case "moveUnit": {
      const unit = findUnit2(state, action.unitId);
      if (!unit) return { valid: false, reason: "unit not found" };
      if (unit.ownerId !== playerId) return { valid: false, reason: "unit is not yours" };
      if (unit.hasMoved) return { valid: false, reason: "unit has already moved this turn" };
      const tile = state.map.tiles.find((t) => hexKey(t.coord) === hexKey(action.targetCoord));
      if (!tile) return { valid: false, reason: "target hex not on map" };
      if (tile.terrainType === "water" /* Water */) return { valid: false, reason: "cannot move to water" };
      const dist = hexDistance(unit.position, action.targetCoord);
      if (dist === 0) return { valid: false, reason: "unit is already there" };
      if (dist > unit.stats.movement) return { valid: false, reason: "target out of movement range" };
      const occupied = state.units.some((u) => hexKey(u.position) === hexKey(action.targetCoord));
      if (occupied) return { valid: false, reason: "target hex is occupied" };
      return { valid: true };
    }
    case "foundCity": {
      const unit = findUnit2(state, action.unitId);
      if (!unit) return { valid: false, reason: "unit not found" };
      if (unit.ownerId !== playerId) return { valid: false, reason: "unit is not yours" };
      if (!unit.canFoundCity) return { valid: false, reason: "unit cannot found a city" };
      const tile = state.map.tiles.find((t) => hexKey(t.coord) === hexKey(unit.position));
      if (!tile || tile.terrainType === "water" /* Water */) {
        return { valid: false, reason: "cannot found a city on water" };
      }
      const tooClose = state.cities.some((c) => hexDistance(c.position, unit.position) <= 1);
      if (tooClose) return { valid: false, reason: "too close to an existing city" };
      return { valid: true };
    }
    case "attackCity": {
      const unit = findUnit2(state, action.unitId);
      if (!unit) return { valid: false, reason: "unit not found" };
      if (unit.ownerId !== playerId) return { valid: false, reason: "unit is not yours" };
      if (unit.hasAttacked) return { valid: false, reason: "unit has already attacked this turn" };
      const city = state.cities.find((c) => c.id === action.cityId);
      if (!city) return { valid: false, reason: "city not found" };
      if (city.ownerId === playerId) return { valid: false, reason: "cannot attack your own city" };
      if (hexDistance(unit.position, city.position) !== 1) return { valid: false, reason: "city is not adjacent" };
      if (relationBetween(state, playerId, city.ownerId) === "pact") {
        return { valid: false, reason: "non-aggression pact prevents this attack" };
      }
      return { valid: true };
    }
    case "proposePact":
    case "declareWar":
    case "proposePeace":
    case "breakPact": {
      if (action.targetId === playerId) return { valid: false, reason: "cannot target yourself" };
      if (!state.players.some((p) => p.id === action.targetId)) {
        return { valid: false, reason: "target player not found" };
      }
      return { valid: true };
    }
    case "proposeTrade": {
      if (action.targetId === playerId) return { valid: false, reason: "cannot target yourself" };
      if (!state.players.some((p) => p.id === action.targetId)) {
        return { valid: false, reason: "target player not found" };
      }
      return { valid: true };
    }
    case "respondToDiplomacy": {
      const proposal = state.diplomaticProposals.find((p) => p.id === action.proposalId);
      if (!proposal) return { valid: false, reason: "proposal not found" };
      if (proposal.targetId !== playerId) return { valid: false, reason: "only the proposal target can respond" };
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
    case "trainUnit": {
      const city = state.cities.find((c) => c.id === action.cityId);
      const player = state.players.find((p) => p.id === playerId);
      const allUnits = unitsForCiv(player.civilizationId, state.era);
      const unitDef = allUnits.find((u) => u.type === action.unitType);
      const newUnit = createUnitFromDef(action.unitId, unitDef, playerId, city.position);
      const updatedPlayers = state.players.map(
        (p) => p.id !== playerId ? p : {
          ...p,
          resources: {
            ...p.resources,
            production: p.resources.production - unitDef.productionCost
          }
        }
      );
      return {
        ok: true,
        state: { ...state, players: updatedPlayers, units: [...state.units, newUnit] }
      };
    }
    case "constructBuilding": {
      const city = state.cities.find((c) => c.id === action.cityId);
      const buildingDef = getBuildingDef(action.buildingType);
      const updatedCity = startConstruction(city, action.buildingType);
      const updatedCities = state.cities.map((c) => c.id === city.id ? updatedCity : c);
      const updatedPlayers = state.players.map(
        (p) => p.id !== playerId ? p : {
          ...p,
          resources: {
            ...p.resources,
            production: p.resources.production - buildingDef.productionCost
          }
        }
      );
      return {
        ok: true,
        state: { ...state, cities: updatedCities, players: updatedPlayers }
      };
    }
    case "moveUnit": {
      const unit = findUnit2(state, action.unitId);
      const units = state.units.map(
        (u) => u.id === unit.id ? { ...u, position: action.targetCoord, hasMoved: true } : u
      );
      const movedState = { ...state, units };
      const ownerId = unit.ownerId;
      const fogEntry = movedState.fogOfWar.find((f) => f.playerId === ownerId);
      if (fogEntry) {
        const ownerUnits = movedState.units.filter((u) => u.ownerId === ownerId);
        const ownerCities = movedState.cities.filter((c) => c.ownerId === ownerId);
        const updatedFog = updateFogOfWar(fogEntry, ownerUnits, ownerCities, state.map.radius);
        return {
          ok: true,
          state: {
            ...movedState,
            fogOfWar: movedState.fogOfWar.map((f) => f.playerId === ownerId ? updatedFog : f)
          }
        };
      }
      return { ok: true, state: movedState };
    }
    case "foundCity": {
      const unit = findUnit2(state, action.unitId);
      const newCity = {
        id: action.cityId,
        name: action.cityName,
        position: { ...unit.position },
        ownerId: playerId,
        population: 1,
        specialization: action.specialization,
        level: 1,
        foodStored: 0,
        buildings: [],
        construction: null,
        hp: 10,
        maxHp: 10
      };
      const units = state.units.filter((u) => u.id !== action.unitId);
      return { ok: true, state: { ...state, units, cities: [...state.cities, newCity] } };
    }
    case "attackCity": {
      const unit = findUnit2(state, action.unitId);
      const city = state.cities.find((c) => c.id === action.cityId);
      const cityMaxHp = city.maxHp ?? 10;
      const cityHp = city.hp ?? cityMaxHp;
      const cityDef = 2 + city.level;
      const dmg = Math.max(1, unit.stats.attack + (unit.stats.cityAttackBonus ?? 0) - cityDef);
      const newHp = Math.max(0, cityHp - dmg);
      const captured = newHp <= 0;
      const updatedCity = captured ? { ...city, ownerId: playerId, hp: cityMaxHp, maxHp: cityMaxHp } : { ...city, hp: newHp, maxHp: cityMaxHp };
      return {
        ok: true,
        state: {
          ...state,
          cities: state.cities.map((c) => c.id === city.id ? updatedCity : c),
          units: state.units.map((u) => u.id === unit.id ? { ...u, hasAttacked: true } : u)
        }
      };
    }
    case "proposePact":
      return fromDiplomacy(proposeNonAggressionPact(state, playerId, action.targetId));
    case "proposeTrade":
      return fromDiplomacy(
        proposeResourceTrade(state, playerId, action.targetId, { offer: action.offer, request: action.request })
      );
    case "declareWar":
      return fromDiplomacy(declareWar(state, playerId, action.targetId));
    case "proposePeace":
      return fromDiplomacy(proposePeace(state, playerId, action.targetId));
    case "breakPact":
      return fromDiplomacy(breakNonAggressionPact(state, playerId, action.targetId));
    case "respondToDiplomacy":
      return fromDiplomacy(respondToProposal(state, playerId, action.proposalId, action.accept));
  }
}
function fromDiplomacy(res) {
  return res.ok ? { ok: true, state: res.state } : { ok: false, reason: res.reason, state: res.state };
}

// ../game-engine/src/ai.ts
function isFavorableAttack(state, attacker, defender, hard = false) {
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: !hard
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
var resourceTotal = (r) => r.gold + r.food + r.production;
function planDiplomaticResponses(state, playerId, now) {
  let s = state;
  const actions = [];
  const pending = s.diplomaticProposals.filter((p) => p.status === "pending" && p.targetId === playerId).slice().sort(byId);
  for (const proposal of pending) {
    const kind = proposal.kind ?? (proposal.terms ? "trade" : "pact");
    const accept = kind === "trade" ? !!proposal.terms && resourceTotal(proposal.terms.offer) >= resourceTotal(proposal.terms.request) : true;
    const action = { type: "respondToDiplomacy", proposalId: proposal.id, accept };
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action);
      const applied = applyAction(s, playerId, action, now);
      if (applied.ok) s = applied.state;
    }
  }
  return { state: s, actions };
}
var isPair2 = (a1, b1, a2, b2) => a1 === a2 && b1 === b2 || a1 === b2 && b1 === a2;
function aiFavorableTrade(me) {
  const entries = [
    ["gold", me.resources.gold],
    ["food", me.resources.food],
    ["production", me.resources.production]
  ].sort((a, b) => b[1] - a[1]);
  const [giveKey, giveHave] = entries[0];
  const askKey = entries[2][0];
  const giveAmt = Math.min(5, giveHave);
  if (giveAmt <= 0 || askKey === giveKey) return null;
  const offer = { gold: 0, food: 0, production: 0 };
  const request = { gold: 0, food: 0, production: 0 };
  offer[giveKey] = giveAmt;
  request[askKey] = 3;
  return { offer, request };
}
function planDiplomaticInitiatives(state, playerId, now) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return { state, actions: [] };
  const contacts = state.players.filter((p) => p.id !== playerId && !p.isEliminated && haveMadeContact(state, playerId, p.id)).slice().sort(byId);
  for (const other of contacts) {
    const pendingBetween = state.diplomaticProposals.some(
      (p) => p.status === "pending" && isPair2(p.proposerId, p.targetId, playerId, other.id)
    );
    if (pendingBetween) continue;
    const relation = relationBetween(state, playerId, other.id);
    let candidate = null;
    if (relation === "neutral") {
      const alreadyOfferedPact = state.diplomaticProposals.some(
        (p) => (p.kind ?? (p.terms ? "trade" : "pact")) === "pact" && p.proposerId === playerId && p.targetId === other.id
      );
      if (!alreadyOfferedPact) candidate = { type: "proposePact", targetId: other.id };
    } else if (relation === "pact") {
      const tradeTurns = state.diplomaticProposals.filter((p) => (p.kind ?? (p.terms ? "trade" : "pact")) === "trade" && p.proposerId === playerId && p.targetId === other.id).map((p) => p.createdAtTurn);
      const lastTradeTurn = tradeTurns.length ? Math.max(...tradeTurns) : -Infinity;
      if (state.turnNumber - lastTradeTurn >= 3) {
        const terms = aiFavorableTrade(me);
        if (terms) candidate = { type: "proposeTrade", targetId: other.id, offer: terms.offer, request: terms.request };
      }
    }
    if (candidate && validateAction(state, playerId, candidate, now).valid) {
      const applied = applyAction(state, playerId, candidate, now);
      if (applied.ok) return { state: applied.state, actions: [candidate] };
    }
  }
  return { state, actions: [] };
}
function decideSubstituteTurn(state, playerId, now) {
  if (!canSubmitAction(state, playerId).valid) return [];
  const defensive = planDefensiveResponses(state, playerId, now);
  const diplomatic = planDiplomaticResponses(defensive.state, playerId, now);
  const initiatives = planDiplomaticInitiatives(diplomatic.state, playerId, now);
  return [...defensive.actions, ...diplomatic.actions, ...initiatives.actions, END_TURN];
}
var MAP_CENTER = { q: 0, r: 0 };
function planMovement(state, playerId, now) {
  let s = state;
  const actions = [];
  const fog = s.fogOfWar.find((f) => f.playerId === playerId);
  const visibleKeys = fog ? new Set(fog.visibleHexes.map(hexKey)) : null;
  const isVisible = (pos) => visibleKeys === null || visibleKeys.has(hexKey(pos));
  const myUnits = s.units.filter((u) => u.ownerId === playerId).slice().sort(byId);
  for (const unit of myUnits) {
    const current = s.units.find((u) => u.id === unit.id);
    if (!current || current.hasMoved) continue;
    const targets = [
      ...s.units.filter((u) => u.ownerId !== playerId && isVisible(u.position)),
      ...s.cities.filter((c) => c.ownerId !== playerId && isVisible(c.position))
    ].slice().sort(byId).map((t) => t.position);
    let targetPos = MAP_CENTER;
    let best = Infinity;
    for (const pos of targets) {
      const d = hexDistance(current.position, pos);
      if (d < best) {
        best = d;
        targetPos = pos;
      }
    }
    const distToTarget = hexDistance(current.position, targetPos);
    if (distToTarget === 0) continue;
    const candidates = hexNeighbors(current.position).slice().sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
    let stepTo = null;
    let stepDist = distToTarget;
    for (const n of candidates) {
      const tile = s.map.tiles.find((t) => hexKey(t.coord) === hexKey(n));
      if (!tile || tile.terrainType === "water" /* Water */) continue;
      if (s.units.some((u) => hexKey(u.position) === hexKey(n))) continue;
      const d = hexDistance(n, targetPos);
      if (d < stepDist) {
        stepDist = d;
        stepTo = n;
      }
    }
    if (!stepTo) continue;
    const action = { type: "moveUnit", unitId: current.id, targetCoord: stepTo };
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action);
      const applied = applyAction(s, playerId, action, now);
      if (applied.ok) s = applied.state;
    }
  }
  return { state: s, actions };
}
function planCityAttack(state, playerId, now) {
  let s = state;
  const actions = [];
  const myUnits = s.units.filter((u) => u.ownerId === playerId).slice().sort(byId);
  for (const unit of myUnits) {
    const current = s.units.find((u) => u.id === unit.id);
    if (!current || current.hasAttacked) continue;
    const targets = s.cities.filter((c) => c.ownerId !== playerId && hexDistance(current.position, c.position) === 1).slice().sort(byId);
    for (const city of targets) {
      const maxHp = city.maxHp ?? 10;
      const hp = city.hp ?? maxHp;
      const adjMine = s.units.filter(
        (u) => u.ownerId === playerId && hexDistance(u.position, city.position) === 1
      ).length;
      const worth = hp <= maxHp * 0.4 || adjMine >= 2;
      if (!worth) continue;
      const action = { type: "attackCity", unitId: current.id, cityId: city.id };
      if (validateAction(s, playerId, action, now).valid) {
        actions.push(action);
        const applied = applyAction(s, playerId, action, now);
        if (applied.ok) s = applied.state;
        break;
      }
    }
  }
  return { state: s, actions };
}
function planUnitTraining(state, playerId, now) {
  let s = state;
  const actions = [];
  const cap = Math.max(3, Math.ceil(s.maxTurns / 2));
  const myUnitCount = s.units.filter((u) => u.ownerId === playerId).length;
  if (myUnitCount >= cap) return { state: s, actions };
  const player = s.players.find((p) => p.id === playerId);
  if (!player) return { state: s, actions };
  let affordable;
  try {
    affordable = unitsForCiv(player.civilizationId, s.era).filter((d) => !d.canFoundCity).slice().sort((a, b) => a.productionCost - b.productionCost || a.type.localeCompare(b.type)).find((d) => d.productionCost <= player.resources.production);
  } catch {
    return { state: s, actions };
  }
  if (!affordable) return { state: s, actions };
  const myCities = s.cities.filter((c) => c.ownerId === playerId).slice().sort(byId);
  for (const city of myCities) {
    const unitId = `ai-u-${city.id.slice(0, 8)}-t${s.turnNumber}`;
    const action = { type: "trainUnit", cityId: city.id, unitType: affordable.type, unitId };
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action);
      const applied = applyAction(s, playerId, action, now);
      if (applied.ok) s = applied.state;
      break;
    }
  }
  return { state: s, actions };
}
function planBuildingConstruction(state, playerId, now) {
  let s = state;
  const actions = [];
  const myCities = s.cities.filter((c) => c.ownerId === playerId).slice().sort(byId);
  for (const city of myCities) {
    const current = s.cities.find((c) => c.id === city.id);
    if (!current || current.construction != null) continue;
    const built = new Set(current.buildings ?? []);
    const candidates = getBuildingsBySpecialization(current.specialization).filter((b) => !built.has(b.type)).slice().sort((a, b) => a.productionCost - b.productionCost || a.type.localeCompare(b.type));
    for (const cand of candidates) {
      const action = { type: "constructBuilding", cityId: current.id, buildingType: cand.type };
      if (validateAction(s, playerId, action, now).valid) {
        actions.push(action);
        const applied = applyAction(s, playerId, action, now);
        if (applied.ok) s = applied.state;
        break;
      }
    }
  }
  return { state: s, actions };
}
function decideOpponentTurn(state, playerId, now, hard = false) {
  if (!canSubmitAction(state, playerId).valid) return [];
  const defensive = planDefensiveResponses(state, playerId, now);
  const diplomatic = planDiplomaticResponses(defensive.state, playerId, now);
  const movement = planMovement(diplomatic.state, playerId, now);
  let s = movement.state;
  const actions = [...defensive.actions, ...diplomatic.actions, ...movement.actions];
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
      if (isFavorableAttack(s, current, enemy, hard) && validateAction(s, playerId, action, now).valid) {
        actions.push(action);
        const applied = applyAction(s, playerId, action, now);
        if (applied.ok) s = applied.state;
        break;
      }
    }
  }
  const cityAttack = planCityAttack(s, playerId, now);
  s = cityAttack.state;
  actions.push(...cityAttack.actions);
  const training = planUnitTraining(s, playerId, now);
  s = training.state;
  actions.push(...training.actions);
  const building = planBuildingConstruction(s, playerId, now);
  s = building.state;
  actions.push(...building.actions);
  const initiatives = planDiplomaticInitiatives(s, playerId, now);
  return [...actions, ...initiatives.actions, END_TURN];
}

// ../game-engine/src/civs.ts
var CIVILIZATIONS = [
  { id: "romans", name: "Romanos", flag: "\u{1F3DB}\uFE0F", color: "#ef4444", unlockLevel: 1, description: "Mestres da engenharia e da lei." },
  { id: "greeks", name: "Gregos", flag: "\u26A1", color: "#3b82f6", unlockLevel: 1, description: "Fil\xF3sofos e estrategistas." },
  { id: "vikings", name: "Vikings", flag: "\u2694\uFE0F", color: "#6b7280", unlockLevel: 3, description: "Guerreiros do norte inclemente." },
  { id: "egyptians", name: "Eg\xEDpcios", flag: "\u2600\uFE0F", color: "#f59e0b", unlockLevel: 4, description: "Construtores de civiliza\xE7\xF5es eternas." },
  { id: "mongols", name: "Mong\xF3is", flag: "\u{1F3F9}", color: "#22c55e", unlockLevel: 6, description: "Conquistadores das estepes sem fim." },
  { id: "china", name: "China", flag: "\u{1F409}", color: "#c0392b", unlockLevel: 8, description: "Com\xE9rcio e tecnologia avan\xE7ada." }
];
var LEVEL_XP_THRESHOLDS = [0, 50, 150, 300, 500, 750, 1050, 1400, 1800];
var XP_FOR_PLAYING = 10;
var XP_WIN_BONUS = 25;
var XP_DAILY_BASE = 15;
var XP_DAILY_WIN = 35;
function xpToLevel(xp) {
  for (let i = LEVEL_XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}
function xpForNextLevel(currentLevel) {
  return LEVEL_XP_THRESHOLDS[currentLevel] ?? Infinity;
}
function xpProgress(xp) {
  const level = xpToLevel(xp);
  const thisFloor = LEVEL_XP_THRESHOLDS[level - 1] ?? 0;
  const nextCeil = LEVEL_XP_THRESHOLDS[level] ?? xp;
  return [xp - thisFloor, nextCeil - thisFloor];
}
function unlockedCivs(xp) {
  const level = xpToLevel(xp);
  return CIVILIZATIONS.filter((c) => c.unlockLevel <= level);
}
function getCiv(id) {
  return CIVILIZATIONS.find((c) => c.id === id) ?? CIVILIZATIONS[0];
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
    const currentPlayer = loaded.gameState.players.find((p) => p.id === loaded.currentPlayerId);
    const aiDifficulty = currentPlayer?.aiDifficulty;
    const actions = aiDifficulty ? decideOpponentTurn(loaded.gameState, loaded.currentPlayerId, now, aiDifficulty === "hard") : decideSubstituteTurn(loaded.gameState, loaded.currentPlayerId, now);
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
  BUILDING_CATALOG,
  BuildingType,
  CITY_VISION_RADIUS,
  CIVILIZATIONS,
  CIVILIZATION_CATALOG,
  COMBAT_TIMEOUT_MS,
  CitySpecialization,
  CombatDisputeStatus,
  DEVELOPMENT_POINTS_PER_LEVEL,
  DiplomaticProposalStatus,
  ERA_ORDER_ARRAY,
  ERA_SCIENCE_THRESHOLDS_ARRAY,
  Era,
  FOOD_PER_POPULATION_GROWTH,
  LEVEL_BONUS_PER_LEVEL,
  LEVEL_XP_THRESHOLDS,
  MAP_SIZES,
  MIN_DAMAGE,
  POPULATION_POINTS_PER_POP,
  ResourceType,
  SPECIAL_UNIT_CATALOG,
  TERRITORY_POINTS_PER_CITY,
  TURN_TIMEOUT_MS,
  TerrainType,
  TurnState,
  UNIT_CATALOG,
  UNIT_MAINTENANCE_GOLD,
  UNIT_VISION_RADIUS,
  UnitType,
  XP_DAILY_BASE,
  XP_DAILY_WIN,
  XP_FOR_PLAYING,
  XP_WIN_BONUS,
  activePlayers,
  applyAction,
  applyBuildingBonuses,
  applyGrowth,
  applyUnitMaintenance,
  breakNonAggressionPact,
  canBuildBuilding,
  canSubmitAction,
  canTrainUnit,
  computeCityProduction,
  computeCityTerritoryBonus,
  computePlayerScore,
  computeVisibleHexes,
  createCombatDispute,
  createUnitFromDef,
  createUnitInstance,
  decideOpponentTurn,
  decideSubstituteTurn,
  declareWar,
  determineWinner,
  diffDisputes,
  eliminatePlayersWithNoCities,
  endTurn,
  generateMap,
  getBuildingDef,
  getBuildingsBySpecialization,
  getCityDefenseBonus,
  getCityEraProgressBonus,
  getCityScoreBonus,
  getCiv,
  getCivCombatMultiplier,
  getCivEconomyMultipliers,
  getCivVisionBonus,
  getCivilization,
  getCurrentPlayer,
  getPlayerById,
  getSpecialUnit,
  getUnitDef,
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
  proposePeace,
  proposeResourceTrade,
  rankPlayers,
  relationBetween,
  resolveCombat,
  resolveDispute,
  resolveDisputeByAction,
  resolveTimedOutDispute,
  respondToNonAggressionPact,
  respondToProposal,
  respondToResourceTrade,
  scoreAll,
  scorePlayer,
  startConstruction,
  submitAction,
  sweepTimeouts,
  terrainAt,
  terrainDefenseBonus,
  tickConstruction,
  unitsAvailableInEra,
  unitsForCiv,
  unlockedCivs,
  updateFogOfWar,
  validateAction,
  xpForNextLevel,
  xpProgress,
  xpToLevel
};
