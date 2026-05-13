import type { PatternOptions } from './helpers'

import { generateMatrixRain, generateGameOfLife, generateBrailleMatrix } from './retro'
import {
  generatePlasmaWaves,
  generateAuroraRibbons,
  generateHypnoticSpirals,
  generateVoronoiCrystals,
  generateLavaMarble,
  generateConcentricWaves,
  generateDitherMagic,
  generateKaleidoscope,
  generateFireParticles,
  generateSnowfall,
  generateCyberpunkRain,
  generateDanmaku,
} from './abstract'
import { generateRadarSweep, generateArcRadar, generateArcRadarHd } from './sci-fi'
import { generateClockFace, generateFireworks, generatePerlinFlowField, generateReactionDiffusion } from './generative'
import {
  generateBeskarSigil,
  generateMandoCompass,
  generateTheTraveller,
  generateCampus9,
  generateIshtarSink,
  generateAltarOfOryx,
  generateTheDawning,
} from './destiny'

export { PatternOptions }

export const GENERATORS: Record<string, (opts: PatternOptions) => Promise<Uint8Array[]>> = {
  matrixRain: generateMatrixRain,
  gameOfLife: generateGameOfLife,
  plasmaWaves: generatePlasmaWaves,
  brailleMatrix: generateBrailleMatrix,
  auroraRibbons: generateAuroraRibbons,
  radarSweep: generateRadarSweep,
  arcRadar: generateArcRadar,
  arcRadarHd: generateArcRadarHd,
  beskarSigil: generateBeskarSigil,
  mandoCompass: generateMandoCompass,
  theTraveller: generateTheTraveller,
  campus9: generateCampus9,
  ishtarSink: generateIshtarSink,
  altarOfOryx: generateAltarOfOryx,
  theDawning: generateTheDawning,
  hypnoticSpirals: generateHypnoticSpirals,
  voronoiCrystals: generateVoronoiCrystals,
  lavaMarble: generateLavaMarble,
  concentricWaves: generateConcentricWaves,
  ditherMagic: generateDitherMagic,
  kaleidoscope: generateKaleidoscope,
  fireParticles: generateFireParticles,
  snowfall: generateSnowfall,
  cyberpunkRain: generateCyberpunkRain,
  danmaku: generateDanmaku,
  clockFace: generateClockFace,
  fireworks: generateFireworks,
  perlinFlowField: generatePerlinFlowField,
  reactionDiffusion: generateReactionDiffusion,
}
