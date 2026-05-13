#!/usr/bin/env node
/**
 * Em-dash + en-dash purge guard.
 *
 * Scans tracked source for U+2014 (—) and U+2013 (–) and exits non-zero
 * if any occurrence is found. The user explicitly removed em-dashes
 * from the UI copy in a prior pass; this prevents regressions slipping
 * back in via copy-paste or AI-generated content.
 *
 * The Python research scripts under protocol-understanding/ are not
 * scanned because they're sniffer notes, not user-facing copy.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const SCAN_DIRS = ['src']
const SCAN_FILES = ['index.html']
const EXTS = new Set(['.svelte', '.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.md'])

const findings = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (EXTS.has(extname(p))) scan(p)
  }
}

function scan(file) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let col = -1
    if ((col = line.indexOf('\u2014')) >= 0) findings.push({ file, line: i + 1, col: col + 1, char: 'em-dash (U+2014)', sample: line.trim().slice(0, 100) })
    if ((col = line.indexOf('\u2013')) >= 0) findings.push({ file, line: i + 1, col: col + 1, char: 'en-dash (U+2013)', sample: line.trim().slice(0, 100) })
  }
}

for (const d of SCAN_DIRS) walk(join(ROOT, d))
for (const f of SCAN_FILES) scan(join(ROOT, f))

if (findings.length === 0) {
  console.log('✓ no em-dash or en-dash characters found in source')
  process.exit(0)
}

console.error(`\n✗ found ${findings.length} dash character(s) that should be replaced with ASCII '-' or rephrased:\n`)
for (const f of findings) {
  console.error(`  ${relative(ROOT, f.file)}:${f.line}:${f.col}  [${f.char}]`)
  console.error(`    ${f.sample}`)
}
console.error('')
process.exit(1)
