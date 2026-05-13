/**
 * Compatibility shim. The pattern registry now lives in `./pattern-meta`
 * (small, eagerly loaded) and the heavy generator implementations live in
 * `./pattern-impls` (lazy-loaded on first `generate()` call). This file
 * just re-exports the public surface so existing import paths keep
 * working.
 */
export { PATTERNS } from './pattern-meta'
export type { PatternMeta as PatternDef, PatternOptions } from './pattern-meta'
