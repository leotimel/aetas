import type { ComponentType } from 'react'
import WarriorSprite from './warrior'
import ArcherSprite from './archer'
import CavalrySprite from './cavalry'
import CatapultSprite from './catapult'
import SettlerSprite from './settler'
import HopliteSprite from './hoplite'
import RomanLegionarySprite from './roman_legionary'
import MongolCavalrySprite from './mongol_cavalry'
import EgyptWarChariotSprite from './egypt_war_chariot'
import VikingBerserkerSprite from './viking_berserker'
import ChinaHorseArcherSprite from './china_horse_archer'

export { default as CitySprite } from './city'
export { default as CapitalSprite } from './capital'

export const UNIT_SPRITES: Record<string, ComponentType<{ color: string }>> = {
  warrior:            WarriorSprite,
  archer:             ArcherSprite,
  cavalry:            CavalrySprite,
  catapult:           CatapultSprite,
  settler:            SettlerSprite,
  knight:             CavalrySprite,
  crossbowman:        ArcherSprite,
  hoplite:            HopliteSprite,
  roman_legionary:    RomanLegionarySprite,
  mongol_cavalry:     MongolCavalrySprite,
  egypt_war_chariot:  EgyptWarChariotSprite,
  viking_berserker:   VikingBerserkerSprite,
  china_horse_archer: ChinaHorseArcherSprite,
}
