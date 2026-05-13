# Visual regression harness

Lightweight Playwright sweeps that capture screenshots and assert on a
handful of layout/positioning invariants. Not a full e2e suite — these
are catch-the-eyeball-stuff tools.

## Files

- `full-audit.mjs` — sweeps four viewports (desktop / lg / tablet / mobile)
  × light + dark, captures PNGs and dumps a JSON report to
  `/tmp/auracast-audit/`.
- `disc-snap.mjs` — focused capture of the preview disc during pattern
  generation, used to verify the shimmer overlay and counter alignment.
- `pattern-audit.mjs` — content regression for every pattern (12) and
  text effect (8). Captures sample frames as JPEG + 3× upscaled PNG,
  computes a per-frame perceptual hash, and compares against
  `baseline/pattern-audit.json`. Catches generator regressions that
  layout snapshots can't see (e.g. the "Dither = orange noise field" bug).

## Run

```sh
# Start the dev server first
npm run dev   # https://localhost:5174 (or 5173)

# Then in another shell:
npm run check:visual              # layout / centering sweep
npm run check:patterns            # generator content regression
npm run snap:patterns             # snapshot only (no comparison)
npm run update:patterns-baseline  # accept current output as new baseline
node test/visual/disc-snap.mjs    # disc-only
```

The dev server uses a self-signed cert; the harness sets
`ignoreHTTPSErrors: true` so this is transparent.
