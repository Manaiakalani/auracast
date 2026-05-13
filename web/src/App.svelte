<script lang="ts">
  import { untrack } from 'svelte'
  import { formatDuration, formatBytes } from './lib/utils'
  import {
    MAX_UPLOAD_BYTES,
    E87_IMAGE_WIDTH,
    E87_IMAGE_HEIGHT,
    previewBitmapToJpeg,
    previewBitmapsToAvi,
    imageFileToPreviewBitmap,
    imagesToPreviewBitmaps,
    videoToPreviewBitmaps,
    fitJpegFramesToBudget,
    canvasToBadgeJpeg,
    type TransformSettings,
    type OutputFrameSize,
  } from './lib/image-processing'
  import { parseAviFrames, readAviFps } from './lib/avi-preview'
  import {
    connectE87,
    disconnectE87,
    writeFileE87,
    stopBrowseE87,
    getScreenInfoE87,
    getBrightnessE87,
    type E87Connection,
    type UploadMode,
    type E87SmallFileEntry,
    type E87FileBrowseEntry,
  } from './lib/e87-protocol'
  import { createDeviceOps } from './lib/device-ops'
  import { buildMjpgAvi, sanitizeJpegForBadge } from './avi-builder'
  import type { PatternDef } from './pattern-generators'
  // qrcode (~30KB) is lazy-loaded the first time the user enters QR mode.
  type QRCodeModule = typeof import('qrcode')
  let qrcodeLib: QRCodeModule | null = null
  let qrcodeLoading: Promise<QRCodeModule> | null = null
  function loadQrcode(): Promise<QRCodeModule> {
    if (qrcodeLib) return Promise.resolve(qrcodeLib)
    if (!qrcodeLoading) {
      qrcodeLoading = import('qrcode').then((mod) => {
        qrcodeLib = (mod.default ?? mod) as QRCodeModule
        return qrcodeLib
      })
    }
    return qrcodeLoading
  }

  import AviPlayer from './lib/AviPlayer.svelte'
  import AuraCastLogo3D from './lib/AuraCastLogo3D.svelte'
  import UploadProgress from './lib/UploadProgress.svelte'
  import PatternMode from './lib/PatternMode.svelte'
  import { generatePatternInWorker, PatternCancelledError } from './lib/pattern-worker-client'
  import LiveTransformCanvas from './lib/LiveTransformCanvas.svelte'
  import PreviewModeSwitch from './lib/PreviewModeSwitch.svelte'
  // Heavy/rare modes: code-split. Loader cache below de-dupes in-flight imports.
  type ModeLoader = () => Promise<{ default: any }>
  const lazyModeLoaders: Record<string, ModeLoader> = {
    text:   () => import('./lib/TextMode.svelte'),
    image:  () => import('./lib/ImageMode.svelte'),
    images: () => import('./lib/SequenceMode.svelte'),
    video:  () => import('./lib/VideoMode.svelte'),
    gif:    () => import('./lib/GifMode.svelte'),
    qr:     () => import('./lib/QrMode.svelte'),
  }
  const lazyModes: Record<string, any> = $state({})
  const lazyModePromises: Record<string, Promise<void>> = {}
  function ensureMode(m: string): void {
    if (lazyModes[m] || !lazyModeLoaders[m]) return
    lazyModePromises[m] ??= lazyModeLoaders[m]().then((mod) => {
      lazyModes[m] = mod.default
    })
  }
  import {
    Button as M3Button,
    IconButton as M3IconButton,
    Card as M3Card,
    NavigationBar as M3NavigationBar,
    NavigationRail as M3NavigationRail,
    TopAppBar as M3TopAppBar,
    Dialog as M3Dialog,
    Icon as M3Icon,
    PreviewSurface,
  } from './lib/m3'
  import type { TextEffect } from './text-generator'
  // Lazy module loader for text-generator; the heavy font + canvas
  // pipeline is only pulled in when the user actually generates text.
  type TextGenModule = typeof import('./text-generator')
  let textGenLib: TextGenModule | null = null
  let textGenLoading: Promise<TextGenModule> | null = null
  function loadTextGen(): Promise<TextGenModule> {
    if (textGenLib) return Promise.resolve(textGenLib)
    if (!textGenLoading) {
      textGenLoading = import('./text-generator').then((mod) => {
        textGenLib = mod as TextGenModule
        return textGenLib
      })
    }
    return textGenLoading
  }

  type PreviewMode = 'live' | 'preview'
  type QrCellStyle = 'square' | 'round' | 'squircle'
  type QrOutsideMode = 'on' | 'off'
  type ScreenInfo = {
    width: number
    height: number
    pictureWidth: number
    pictureHeight: number
    memory: number
  }

  type SavedSettings = {
    uploadMode?: UploadMode
    interChunkDelayMs?: number
    videoFps?: number
    sequenceFps?: number
    patternFrameCount?: number
    patternFps?: number
    qrUrl?: string
    qrDarkColor?: string
    qrLightColor?: string
    qrDotStyle?: QrCellStyle
    qrOutsideMode?: QrOutsideMode
    qrZoom?: number
    qrRotation?: number
    text?: string
    textEffect?: TextEffect
    textFontId?: string
    textColor?: string
    textBackground?: string
    textFps?: number
    textFrames?: number
    imageBackdropColor?: string
    imagePreviewMode?: PreviewMode
    sequencePreviewMode?: PreviewMode
    videoPreviewMode?: PreviewMode
    imageScale?: number
    imagePanX?: number
    imagePanY?: number
    sequenceScale?: number
    sequencePanX?: number
    sequencePanY?: number
    videoScale?: number
    videoPanX?: number
    videoPanY?: number
    colorScheme?: ColorScheme
    selectedPatternId?: string
    patternOutputMode?: 'still' | 'video'
    animateThumbnails?: boolean
  }

  type ColorScheme = 'light' | 'dark' | 'system'

  const SETTINGS_STORAGE_KEY = 'badgeWriterSettings.v2'

  function loadSettings(): SavedSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      return raw ? JSON.parse(raw) as SavedSettings : {}
    } catch {
      return {}
    }
  }

  function pm(value: unknown, fallback: PreviewMode): PreviewMode {
    return value === 'live' || value === 'preview' ? value : fallback
  }

  function n(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  function s(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback
  }

  const saved = loadSettings()

  const debugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')

  // ─── URL share params ────────────────────────────────────────────────
  // ?mode=pattern&pattern=plasma&frames=24&fps=12
  // Overrides saved settings when present, enabling shareable preview links.
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  if (urlParams) {
    const mode = urlParams.get('mode')
    if (mode && ['pattern', 'text', 'image', 'images', 'video', 'qr'].includes(mode)) {
      saved.uploadMode = mode as UploadMode
    }
    const pat = urlParams.get('pattern')
    if (pat) saved.selectedPatternId = pat
    const frames = urlParams.get('frames')
    if (frames && Number.isFinite(+frames)) saved.patternFrameCount = +frames
    const fps = urlParams.get('fps')
    if (fps && Number.isFinite(+fps)) saved.patternFps = +fps
  }

  // HTTP-fallback transport: when Web Bluetooth isn't available (Safari) we
  // fall back to talking to the local FastAPI backend (which uses Python BLE).
  // Same UI, different wire - set automatically based on browser capability.
  const hasWebBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator
  let httpConn: { http: true; address: string } | null = $state(null)

  let conn: E87Connection | null = $state(null)
  let isConnecting = $state(false)
  let isWriting = $state(false)
  let cancelRequested = $state(false)
  let interChunkDelayMs = $state(n(saved.interChunkDelayMs, 0))

  let status = $state(hasWebBluetooth
    ? 'Disconnected'
    : 'Ready • Safari will connect through the local bridge')
  let batteryLevel: number | null = $state(null)
  let batteryUpdatedAt = $state('')
  let batteryCharging = $state(false)
  let brightnessLevel: number | null = $state(null)
  let brightnessDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let screenWidth = $state<number | null>(null)
  let screenHeight = $state<number | null>(null)
  let pictureWidth = $state(E87_IMAGE_WIDTH)
  let pictureHeight = $state(E87_IMAGE_HEIGHT)

  // Live "badge online" indicator. In HTTP mode we poll /api/status; in
  // BLE mode the device is either GATT-connected (online) or not.
  let badgeOnline: boolean | null = $state(null)
  let badgeSeenAgoSec: number | null = $state(null)
  let backendState: string | null = $state(null)
  let backendDetail: string = $state('')
  let bridgeReachable: boolean | null = $state(null)
  let isRunningDiagnostics = $state(false)
  let diagnosticsResult: any = $state(null)
  let currentHttpAbort: AbortController | null = null

  // HTTP-bridge poll: when Web Bluetooth isn't available (e.g. iOS Safari)
  // the user runs the page through a local relay; poll its /api/status so
  // the connection pill stays live. Wrapped in $effect so HMR doesn't
  // stack intervals during dev and so the timer is cleared if the root
  // ever unmounts.
  $effect(() => {
    if (typeof window === 'undefined' || hasWebBluetooth) return
    const tick = async () => {
      try {
        const r = await fetch('/api/status', { cache: 'no-store' })
        if (!r.ok) { badgeOnline = false; badgeSeenAgoSec = null; bridgeReachable = false; return }
        const d = await r.json()
        badgeOnline = !!d.online
        badgeSeenAgoSec = d.seen_seconds_ago ?? null
        backendState = d.state ?? null
        backendDetail = d.detail ?? ''
        bridgeReachable = true
      } catch { badgeOnline = false; badgeSeenAgoSec = null; bridgeReachable = false }
    }
    const id = setInterval(tick, 1500)
    void tick()
    return () => clearInterval(id)
  })

  let isDeviceOpsBusy = $state(false)
  let smallFiles: E87SmallFileEntry[] = $state([])
  let browseEntries: E87FileBrowseEntry[] = $state([])
  let selectedSmallFileKey = $state('')
  let smallFileReadText = $state('')
  let rcspInfoText = $state('')

  let logs: string[] = $state([])

  let uploadMode: UploadMode = $state((saved.uploadMode ?? 'pattern') as UploadMode)

  // Mode tab metadata for sidebar (desktop) and pill row (mobile).
  const MODE_TABS: { id: UploadMode; label: string; mobileLabel?: string; icon: string }[] = [
    { id: 'pattern', label: 'Patterns',  mobileLabel: 'Pattern',  icon: 'auto_awesome' },
    { id: 'text',    label: 'Text',                                icon: 'text_fields' },
    { id: 'image',   label: 'Image',                               icon: 'image' },
    { id: 'images',  label: 'Sequence',  mobileLabel: 'Seq',       icon: 'reorder' },
    { id: 'video',   label: 'Video',                               icon: 'movie' },
    { id: 'gif',     label: 'GIF',                                  icon: 'gif_box' },
    { id: 'qr',      label: 'QR code',  mobileLabel: 'QR',         icon: 'qr_code' },
  ]

  // Static per-mode metadata for the page header + mode panel title.
  // Keyed on mode so switching never produces partial-string artifacts
  // (e.g. "Videoence" from in-place text-node mutation between modes).
  const MODE_HEADER: Record<UploadMode, { icon: string; title: string; panelTitle: string; intro: string }> = {
    pattern: { icon: 'auto_awesome', title: 'Patterns', panelTitle: 'Pick a pattern', intro: 'Procedural animations rendered to a seamless 368×368 loop. Pick one; it auto-previews, then send it.' },
    text:    { icon: 'text_fields',  title: 'Text',     panelTitle: 'Type your text', intro: 'Type a phrase, choose a vibe. Eight effects from a clean still to a rainbow marquee.' },
    image:   { icon: 'image',        title: 'Image',    panelTitle: 'Upload image',   intro: 'Drop in a still. We crop to circle, fit to 368×368, and burn it to the badge.' },
    images:  { icon: 'reorder',      title: 'Sequence', panelTitle: 'Frame sequence', intro: 'Stack a few stills and play them as a stop-motion loop on the badge.' },
    video:   { icon: 'movie',        title: 'Video',    panelTitle: 'Video clip',     intro: 'Trim a clip, set the framerate, and send it as an MJPEG that fits in 900\u00a0KB.' },
    gif:     { icon: 'gif_box',      title: 'GIF',      panelTitle: 'Import GIF',     intro: 'Drop an animated GIF. Frames are extracted, cropped to circle, and sent as a looping badge animation.' },
    qr:      { icon: 'qr_code',      title: 'QR code',  panelTitle: 'QR code',        intro: 'Generate a circular QR with custom colors and dot styles. Scans straight off the badge.' },
  }
  let selectedFile: File | null = $state(null)
  let selectedFiles: File[] = $state([])
  let previewUrl: string | null = $state(null)

  let videoFps = $state(n(saved.videoFps, 12))
  let sequenceFps = $state(n(saved.sequenceFps, 1))
  let videoTrimStart = $state(0)
  let videoTrimEnd = $state(0)
  let videoDuration = $state(0)
  let patternFrameCount = $state(n(saved.patternFrameCount, 24))
  let patternFps = $state(n(saved.patternFps, 15))
  let patternOutputMode = $state<'still' | 'video'>(
    saved.patternOutputMode === 'still' ? 'still' : 'video',
  )
  let selectedPattern: PatternDef | null = $state(null)
  let animateThumbnails = $state(saved.animateThumbnails !== false)
  let qrUrl = $state(s(saved.qrUrl, 'https://example.com'))
  let qrDarkColor = $state(s(saved.qrDarkColor, '#111111'))
  let qrLightColor = $state(s(saved.qrLightColor, '#f5f7ff'))
  let qrDotStyle: QrCellStyle = $state((saved.qrDotStyle ?? 'round') as QrCellStyle)
  let qrOutsideMode: QrOutsideMode = $state((saved.qrOutsideMode ?? 'on') as QrOutsideMode)
  let qrZoom = $state(n(saved.qrZoom, 1.08))
  let qrRotation = $state(Math.round(n(saved.qrRotation, 0) / 45) * 45)
  let imageBackdropColor = $state(s(saved.imageBackdropColor, '#000000'))

  // GIF mode state
  let gifBusy = $state(false)

  // Text mode state
  let text = $state(s(saved.text, 'AURA ON'))
  let textEffect: TextEffect = $state((saved.textEffect ?? 'rainbow') as TextEffect)
  let textFontId = $state(s(saved.textFontId, 'sansbold'))
  let textColor = $state(s(saved.textColor, '#f5f7ff'))
  let textBackground = $state(s(saved.textBackground, '#000000'))
  let textFps = $state(n(saved.textFps, 12))
  let textFrames = $state(n(saved.textFrames, 24))
  let textAutoSignature = $state('')

  let aviPreviewFrames: ImageBitmap[] = $state([])
  let aviPreviewFps = $state(12)
  let isGeneratingPreview = $state(false)
  let isGeneratingQr = $state(false)
  let isGeneratingPattern = $state(false)
  let activePatternJob: { cancel: () => void } | null = null
  let preparedPayload: Uint8Array | null = $state(null)
  let preparedPayloadLabel = $state('')
  let preparedIsStillImage = $state(false)
  let aviPlayer: AviPlayer | null = $state(null)
  let helpOpen = $state(false)

  // ─── Theme (light / dark / system) ─────────────────────────────────
  // Default is the OS preference; clicking the toggle swaps light↔dark.
  // Long-press (or shift+click) the toggle to switch to "system" mode,
  // which then live-tracks the OS preference until the user clicks again.
  function detectInitialScheme(): ColorScheme {
    if (saved.colorScheme === 'light' || saved.colorScheme === 'dark' || saved.colorScheme === 'system') return saved.colorScheme
    if (typeof window !== 'undefined' && 'matchMedia' in window) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'dark'
  }
  let colorScheme: ColorScheme = $state(detectInitialScheme())
  let osPrefersDark = $state(typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true)
  $effect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => { osPrefersDark = e.matches }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  })
  // Effective scheme that gets applied to <html data-theme>.
  const effectiveScheme = $derived<'light' | 'dark'>(
    colorScheme === 'system' ? (osPrefersDark ? 'dark' : 'light') : colorScheme
  )
  $effect(() => {
    if (typeof document === 'undefined') return
    if (effectiveScheme === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
    // Sync the browser/OS chrome (status bar tinting on iOS Safari, etc.)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim() || (effectiveScheme === 'light' ? '#fafafa' : '#0d0e1c'))
    }
  })
  function toggleColorScheme(e?: MouseEvent | KeyboardEvent): void {
    // Shift-click (or shift+enter) is a power-user shortcut to "follow OS".
    if (e && 'shiftKey' in e && e.shiftKey) {
      colorScheme = 'system'
      return
    }
    // From system, click commits to the *current* effective scheme's
    // opposite so the click does what the user expects (flip).
    const base = colorScheme === 'system' ? effectiveScheme : colorScheme
    colorScheme = base === 'dark' ? 'light' : 'dark'
  }
  // Long-press to enter system mode. Touch + mouse + pen via Pointer Events.
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressFired = false
  function onThemePointerDown(): void {
    longPressFired = false
    if (longPressTimer) clearTimeout(longPressTimer)
    longPressTimer = setTimeout(() => {
      longPressFired = true
      colorScheme = 'system'
      longPressTimer = null
    }, 550)
  }
  function onThemePointerUp(): void {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
  }
  function onThemeClick(e: MouseEvent): void {
    if (longPressFired) { longPressFired = false; e.preventDefault(); return }
    toggleColorScheme(e)
  }
  // The icon previews the destination (or 'computer' while in system mode).
  const colorSchemeIcon = $derived(
    colorScheme === 'system' ? 'computer'
    : colorScheme === 'dark' ? 'light_mode' : 'dark_mode'
  )
  const colorSchemeLabel = $derived(
    colorScheme === 'system'
      ? `Theme: follow system (${effectiveScheme}). Click to override.`
      : `Switch to ${colorScheme === 'dark' ? 'light' : 'dark'} mode (long-press for system)`
  )

  // ─── Pattern preview cache ─────────────────────────────────────────
  // Re-selecting a previously-previewed pattern (same frames/fps/output)
  // skips the entire generate→fit→encode pipeline. Bytes are cheap;
  // ImageBitmaps are recreated via parseAviFrames() on each hit because
  // the active set is .close()d when the preview is cleared.
  type PatternCacheEntry = { avi: Uint8Array; fps: number; label: string }
  const PATTERN_CACHE_MAX = 8
  const patternPreviewCache = new Map<string, PatternCacheEntry>()
  function patternCacheKey(id: string, frames: number, fps: number, w: number, h: number): string {
    return `${id}|${frames}|${fps}|${w}x${h}`
  }
  function setPatternCache(key: string, val: PatternCacheEntry): void {
    patternPreviewCache.delete(key) // re-insert moves to end (LRU)
    patternPreviewCache.set(key, val)
    while (patternPreviewCache.size > PATTERN_CACHE_MAX) {
      const oldest = patternPreviewCache.keys().next().value
      if (oldest === undefined) break
      patternPreviewCache.delete(oldest)
    }
  }

  let imagePreviewMode: PreviewMode = $state(pm(saved.imagePreviewMode, 'live'))
  let sequencePreviewMode: PreviewMode = $state(pm(saved.sequencePreviewMode, 'live'))
  let videoPreviewMode: PreviewMode = $state(pm(saved.videoPreviewMode, 'live'))

  let imageLiveFrames: ImageBitmap[] = $state([])
  let sequenceLiveFrames: ImageBitmap[] = $state([])
  let videoLiveFrames: ImageBitmap[] = $state([])

  let imageScale = $state(n(saved.imageScale, 1))
  let imagePanX = $state(n(saved.imagePanX, 0))
  let imagePanY = $state(n(saved.imagePanY, 0))
  let sequenceScale = $state(n(saved.sequenceScale, 1))
  let sequencePanX = $state(n(saved.sequencePanX, 0))
  let sequencePanY = $state(n(saved.sequencePanY, 0))
  let videoScale = $state(n(saved.videoScale, 1))
  let videoPanX = $state(n(saved.videoPanX, 0))
  let videoPanY = $state(n(saved.videoPanY, 0))

  let videoCacheSignature = $state('')
  let autoPreviewSignature = $state('')
  let qrAutoSignature = $state('')

  let videoScrubFrame: ImageBitmap | null = $state(null)
  let isVideoScrubbing = $state(false)
  let videoScrubUrl: string | null = $state(null)
  let videoScrubElement: HTMLVideoElement | null = $state(null)
  let videoScrubRequestId = $state(0)

  let progress = $state(0)
  let progressLabel = $state('')
  let uploadStartTime = $state(0)
  let sentBytesForEta = $state(0)
  let totalBytesForEta = $state(0)

  // ─── Logging ───

  function log(message: string): void {
    const ts = new Date().toLocaleTimeString()
    logs = [`[${ts}] ${message}`, ...logs].slice(0, 250)
  }

  function applyScreenInfo(info: ScreenInfo | null): void {
    if (!info) return
    screenWidth = info.width
    screenHeight = info.height
    const hasScreenSize = Number.isFinite(info.width) && info.width > 0 && Number.isFinite(info.height) && info.height > 0
    const hasPictureSize = Number.isFinite(info.pictureWidth) && info.pictureWidth > 0 && Number.isFinite(info.pictureHeight) && info.pictureHeight > 0

    if (hasScreenSize) {
      pictureWidth = Math.max(1, Math.round(info.width))
      pictureHeight = Math.max(1, Math.round(info.height))
      log(`Output frame size set to ${pictureWidth}x${pictureHeight} (from screen size; picture=${info.pictureWidth}x${info.pictureHeight}).`)
      return
    }

    if (hasPictureSize) {
      pictureWidth = Math.max(1, Math.round(info.pictureWidth))
      pictureHeight = Math.max(1, Math.round(info.pictureHeight))
      log(`Output frame size set to ${pictureWidth}x${pictureHeight} (from picture size).`)
    }
  }

  function getOutputFrameSize(): OutputFrameSize {
    return {
      width: pictureWidth,
      height: pictureHeight,
    }
  }

  async function resizeJpegToOutput(jpegBytes: Uint8Array, output: OutputFrameSize): Promise<Uint8Array> {
    if (output.width === 368 && output.height === 368) return jpegBytes
    const blob = new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' })
    const bitmap = await createImageBitmap(blob)
    try {
      const canvas = new OffscreenCanvas(output.width, output.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not create 2D canvas context.')
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, output.width, output.height)
      ctx.drawImage(bitmap, 0, 0, output.width, output.height)
      return canvasToBadgeJpeg(canvas, 0.9)
    } finally {
      bitmap.close()
    }
  }

  async function normalizePatternFramesForOutput(frames: Uint8Array[]): Promise<Uint8Array[]> {
    const output = getOutputFrameSize()
    if (output.width === 368 && output.height === 368) return frames
    const resized: Uint8Array[] = []
    for (let i = 0; i < frames.length; i++) {
      resized.push(await resizeJpegToOutput(frames[i], output))
    }
    return resized
  }

  /**
   * Single source of truth for "selected pattern → uploadable AVI bytes".
   *
   * Used by both the preview path (Generate preview) and the upload path
   * (Send to badge without prior preview). Hits the LRU cache when the
   * exact same {pattern, frames, fps, output size} combo has been built
   * before, so a Send right after a Preview is instant.
   *
   * Safe to call without setting isGeneratingPattern - it manages that
   * flag internally so the cache-hit path doesn't strobe the spinner.
   */
  async function buildPatternAvi(pat: PatternDef): Promise<{ avi: Uint8Array; label: string; fits: boolean }> {
    const out = getOutputFrameSize()
    const cacheKey = patternCacheKey(pat.id, patternFrameCount, patternFps, out.width, out.height)
    const cached = patternPreviewCache.get(cacheKey)
    if (cached) {
      // Re-insert to mark as most-recently-used.
      setPatternCache(cacheKey, cached)
      return { avi: cached.avi, label: cached.label, fits: true }
    }
    isGeneratingPattern = true
    activePatternJob?.cancel()
    try {
      const handle = generatePatternInWorker(pat.generatorKey, { frames: patternFrameCount, fps: patternFps })
      activePatternJob = handle
      const raw = await handle.result
      activePatternJob = null
      const frames = await normalizePatternFramesForOutput(raw)
      const fitted = await fitJpegFramesToBudget(frames, out.width, out.height, MAX_UPLOAD_BYTES, log)
      if (!fitted.fits) {
        log(`⚠️ Could not fit ${patternFrameCount} frames under ${formatBytes(MAX_UPLOAD_BYTES)} even at quality 0.25 (got ${formatBytes(fitted.totalBytes)}). Try fewer frames or lower fps.`)
      } else if (fitted.quality < 1) {
        log(`Auto-shrunk to JPEG quality ${fitted.quality.toFixed(2)} to fit ${formatBytes(MAX_UPLOAD_BYTES)} budget.`)
      }
      const avi = buildMjpgAvi(fitted.frames, { fps: patternFps })
      const label = `${pat.name} · ${patternFrameCount} frames @ ${patternFps}fps`
      if (fitted.fits) setPatternCache(cacheKey, { avi, fps: patternFps, label })
      return { avi, label, fits: fitted.fits }
    } finally {
      isGeneratingPattern = false
    }
  }

  // ─── Connection ───

  async function connect(): Promise<void> {
    if (!hasWebBluetooth) {
      // HTTP fallback: ping the local FastAPI backend.
      isConnecting = true
      try {
        status = 'Connecting to local HTTP backend…'
        const r = await fetch('/api/status')
        if (!r.ok) throw new Error(`backend returned ${r.status}`)
        const d = await r.json()
        httpConn = { http: true, address: d.address ?? 'badge' }
        status = `Connected via HTTP backend (${d.address ?? 'badge'})`
        log(status)
      } catch (error) {
        status = `HTTP backend unreachable at /api/status. Make sure the local FastAPI server is running on the same origin. (${(error as Error).message})`
        log(status)
        httpConn = null
      } finally {
        isConnecting = false
      }
      return
    }
    isConnecting = true
    try {
      status = 'Requesting device…'
      const nextConn = await connectE87(log)
      batteryLevel = nextConn.batteryLevel
      batteryUpdatedAt = nextConn.batteryUpdatedAt
      batteryCharging = nextConn.batteryCharging
      // Auto-read screen info
      try {
        const info = await getScreenInfoE87(nextConn, log)
        applyScreenInfo(info)
      } catch { /* best effort */ }
      // Auto-read brightness
      try {
        const brightness = await getBrightnessE87(nextConn, log)
        if (brightness !== null) brightnessLevel = brightness
      } catch { /* best effort */ }
      conn = nextConn
      status = `Connected: ${nextConn.device.name ?? 'Unknown device'}`

      // Auto-reconnect: when the GATT server drops the link, clear our
      // conn reference so the UI reflects reality. The next upload will
      // notice and re-prompt automatically.
      try {
        nextConn.device.addEventListener('gattserverdisconnected', () => {
          if (conn === nextConn) {
            log('GATT server disconnected (idle). Clearing connection.')
            conn = null
            status = 'Disconnected (badge dropped the link). Click Connect to retry.'
          }
        }, { once: true })
      } catch { /* best effort */ }
    } catch (error) {
      status = `Connection failed: ${(error as Error).message}`
      log(status)
      conn = null
      batteryLevel = null
      batteryUpdatedAt = ''
      batteryCharging = false
      brightnessLevel = null
    } finally {
      isConnecting = false
    }
  }

  async function disconnect(): Promise<void> {
    cancelRequested = true
    if (httpConn) {
      httpConn = null
      status = 'Disconnected (HTTP backend)'
      progress = 0
      progressLabel = ''
      log('Disconnected.')
      return
    }
    if (conn) {
      await disconnectE87(conn, log)
      conn = null
    }
    batteryLevel = null
    batteryUpdatedAt = ''
    batteryCharging = false
    brightnessLevel = null
    screenWidth = null
    screenHeight = null
    pictureWidth = E87_IMAGE_WIDTH
    pictureHeight = E87_IMAGE_HEIGHT
    status = 'Disconnected'
    progress = 0
    progressLabel = ''
    smallFiles = []
    browseEntries = []
    selectedSmallFileKey = ''
    smallFileReadText = ''
    log('Disconnected.')
  }

  // ─── Device utility actions ───

  function getSelectedSmallFile(): E87SmallFileEntry | null {
    if (!selectedSmallFileKey) return null
    const key = selectedSmallFileKey
    return smallFiles.find((f) => `${f.type}:${f.id}` === key) ?? null
  }

  const deviceOps = createDeviceOps({
    log,
    setStatus: (s) => { status = s },
    setBusy: (b) => { isDeviceOpsBusy = b },
    setBattery: (lvl, at, chg) => { batteryLevel = lvl; batteryUpdatedAt = at; batteryCharging = chg },
    setBrightnessLevel: (n) => { brightnessLevel = n },
    setSmallFiles: (files) => { smallFiles = files },
    setSelectedSmallFileKey: (key) => { selectedSmallFileKey = key },
    setSmallFileReadText: (text) => { smallFileReadText = text },
    setBrowseEntries: (entries) => { browseEntries = entries },
    setRcspInfoText: (text) => { rcspInfoText = text },
    applyScreenInfo,
    getConnection: () => conn,
    getSelectedSmallFile,
    getSmallFiles: () => smallFiles,
  })

  const {
    refreshBattery,
    getBrightness,
    setBrightness,
    listSmallFiles,
    browseFiles,
    queryScreenInfo,
    readSelectedSmallFile,
    deleteSelectedSmallFile,
    getTargetFeatureMap,
    getTargetInfo,
    getSysInfo,
  } = deviceOps

  function debouncedSetBrightness(e: Event): void {
    const target = e.target as HTMLInputElement
    const value = Number(target.value)
    brightnessLevel = value
    if (brightnessDebounceTimer !== null) clearTimeout(brightnessDebounceTimer)
    brightnessDebounceTimer = setTimeout(() => {
      brightnessDebounceTimer = null
      setBrightness(value)
    }, 300)
  }

  // ─── File handling ───

  function revokePreviewUrl() {
    if (previewUrl && !previewUrl.startsWith('/')) URL.revokeObjectURL(previewUrl)
  }

  function clearFrames(frames: ImageBitmap[]): void {
    frames.forEach((frame) => frame.close())
  }

  function clearAviPreview(): void {
    aviPlayer?.stop()
    clearFrames(aviPreviewFrames)
    aviPreviewFrames = []
  }

  function clearPreparedState(): void {
    preparedPayload = null
    preparedPayloadLabel = ''
    preparedIsStillImage = false
  }

  function makeBlob(bytes: Uint8Array, type: string): Blob {
    return new Blob([new Uint8Array(bytes)], { type })
  }

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    if (typeof window === 'undefined') return
    // Re-read all persisted fields so this effect tracks them, but defer the
    // serialize+write until the user has stopped fiddling for a beat.
    const persist: SavedSettings = {
      uploadMode,
      interChunkDelayMs,
      videoFps,
      sequenceFps,
      patternFrameCount,
      patternFps,
      qrUrl,
      qrDarkColor,
      qrLightColor,
      qrDotStyle,
      qrOutsideMode,
      qrZoom,
      qrRotation,
      imageBackdropColor,
      imagePreviewMode,
      sequencePreviewMode,
      videoPreviewMode,
      imageScale,
      imagePanX,
      imagePanY,
      sequenceScale,
      sequencePanX,
      sequencePanY,
      videoScale,
      videoPanX,
      videoPanY,
      text,
      textEffect,
      textFontId,
      textColor,
      textBackground,
      textFps,
      textFrames,
      colorScheme,
      selectedPatternId: selectedPattern?.id,
      patternOutputMode,
      animateThumbnails,
    }
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persist)) } catch {}
    }, 250)
    return () => { if (persistTimer) { clearTimeout(persistTimer); persistTimer = null } }
  })

  /** Build a shareable URL for the current pattern config. */
  function getShareUrl(): string {
    const u = new URL(window.location.href.split('?')[0])
    if (uploadMode === 'pattern' && selectedPattern) {
      u.searchParams.set('mode', 'pattern')
      u.searchParams.set('pattern', selectedPattern.id)
      u.searchParams.set('frames', String(patternFrameCount))
      u.searchParams.set('fps', String(patternFps))
    }
    return u.toString()
  }

  async function copyShareUrl(): Promise<void> {
    const url = getShareUrl()
    try {
      await navigator.clipboard.writeText(url)
      log('Share link copied to clipboard')
    } catch {
      log(`Share link: ${url}`)
    }
  }

  function resetVideoScrubber(): void {
    videoScrubRequestId += 1
    if (videoScrubFrame) {
      videoScrubFrame.close()
      videoScrubFrame = null
    }
    if (videoScrubUrl) {
      URL.revokeObjectURL(videoScrubUrl)
      videoScrubUrl = null
    }
    videoScrubElement = null
    isVideoScrubbing = false
  }

  async function ensureVideoScrubber(): Promise<HTMLVideoElement> {
    if (videoScrubElement && videoScrubUrl) return videoScrubElement
    if (!selectedFile) throw new Error('No selected video for scrubbing.')

    videoScrubUrl = URL.createObjectURL(selectedFile)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Could not initialize scrubber video.'))
      video.src = videoScrubUrl!
    })
    videoScrubElement = video
    return video
  }

  async function updateVideoScrubFrame(time: number): Promise<void> {
    const reqId = ++videoScrubRequestId
    if (!selectedFile) return

    try {
      const video = await ensureVideoScrubber()
      const t = Math.max(0, Math.min(videoDuration || video.duration || 0, time))
      video.currentTime = t
      await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
      if (reqId !== videoScrubRequestId) return

      const size = 512
      const canvas = new OffscreenCanvas(size, size)
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const srcFullW = video.videoWidth
      const srcFullH = video.videoHeight
      const minDim = Math.min(srcFullW, srcFullH)
      const cropX = (srcFullW - minDim) / 2
      const cropY = (srcFullH - minDim) / 2

      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(video, cropX, cropY, minDim, minDim, 0, 0, size, size)
      const bmp = await createImageBitmap(canvas)
      if (reqId !== videoScrubRequestId) {
        bmp.close()
        return
      }
      if (videoScrubFrame) videoScrubFrame.close()
      videoScrubFrame = bmp
    } catch (err) {
      log(`Scrub frame failed: ${(err as Error).message}`)
    }
  }

  function onVideoScrubStart(): void {
    isVideoScrubbing = true
  }

  function onVideoScrubFrame(time: number): void {
    updateVideoScrubFrame(time).catch((err) => log(`Scrub preview error: ${(err as Error).message}`))
  }

  function onVideoScrubEnd(): void {
    isVideoScrubbing = false
  }

  async function prepareImageLiveFrames(): Promise<void> {
    clearFrames(imageLiveFrames)
    imageLiveFrames = []
    if (!selectedFile) return
    imageLiveFrames = [await imageFileToPreviewBitmap(selectedFile)]
  }

  async function prepareSequenceLiveFrames(): Promise<void> {
    clearFrames(sequenceLiveFrames)
    sequenceLiveFrames = []
    if (selectedFiles.length === 0) return
    sequenceLiveFrames = await imagesToPreviewBitmaps(selectedFiles)
  }

  async function prepareVideoLiveFrames(): Promise<void> {
    clearFrames(videoLiveFrames)
    videoLiveFrames = []
    if (!selectedFile || videoDuration <= 0) return
    videoLiveFrames = await videoToPreviewBitmaps(selectedFile, {
      fps: videoFps,
      trimStart: videoTrimStart,
      trimEnd: videoTrimEnd,
    }, log)
  }

  async function setFile(event: Event): Promise<void> {
    resetVideoScrubber()
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    selectedFile = file
    clearPreparedState()
    clearAviPreview()
    revokePreviewUrl()
    previewUrl = null
    if (file) {
      log(`Selected: ${file.name}`)
      await prepareImageLiveFrames()
    }
  }

  async function setMultipleFiles(event: Event): Promise<void> {
    resetVideoScrubber()
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return
    selectedFiles = Array.from(files)
    clearPreparedState()
    clearAviPreview()
    revokePreviewUrl()
    previewUrl = null
    log(`Selected ${selectedFiles.length} images for sequence`)
    await prepareSequenceLiveFrames()
  }

  async function setVideoFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    resetVideoScrubber()
    selectedFile = file
    clearPreparedState()
    clearAviPreview()
    revokePreviewUrl()
    previewUrl = null
    videoTrimStart = 0
    videoTrimEnd = 0
    videoDuration = 0
    videoCacheSignature = ''

    clearFrames(videoLiveFrames)
    videoLiveFrames = []

    if (file) {
      log(`Selected video: ${file.name} (${formatBytes(file.size)})`)
      const v = document.createElement('video')
      v.preload = 'metadata'
      const objUrl = URL.createObjectURL(file)
      try {
        await new Promise<void>((resolve, reject) => {
          v.onloadedmetadata = () => resolve()
          v.onerror = () => reject(new Error('Failed to read video metadata'))
          v.src = objUrl
        })
        videoDuration = v.duration
        videoTrimEnd = Math.min(v.duration, 10)
      } finally {
        URL.revokeObjectURL(objUrl)
        v.removeAttribute('src')
      }
      // Frame extraction is heavy (one decoder seek per frame). We rely on
      // the debounced $effect on (file, trim, fps) to schedule it 260ms after
      // the controls render, so the trim UI shows up instantly here.
    }
  }

  function selectPattern(pat: PatternDef): void {
    selectedPattern = pat
    clearPreparedState()
    clearAviPreview()
  }

  function switchMode(mode: UploadMode): void {
    uploadMode = mode
    ensureMode(mode)
    if (mode === 'qr') {
      qrAutoSignature = ''
      void loadQrcode() // warm cache so first generate is instant
    }
    if (mode === 'text') textAutoSignature = ''
    clearAviPreview()
    clearPreparedState()
    revokePreviewUrl()
    previewUrl = null
    if (mode !== 'video') {
      isVideoScrubbing = false
    }
  }
  // Kick off the saved mode's chunk fetch immediately so the controls are
  // ready by the time the user looks at them. Wrapped in `untrack` so this
  // top-level call doesn't subscribe to future uploadMode changes
  // (switchMode already calls ensureMode for those).
  untrack(() => ensureMode(uploadMode))

  function getTransform(mode: UploadMode): TransformSettings {
    if (mode === 'image') return {
      scale: imageScale,
      panX: imagePanX,
      panY: imagePanY,
      backdropColor: imageBackdropColor,
    }
    if (mode === 'images') return { scale: sequenceScale, panX: sequencePanX, panY: sequencePanY }
    if (mode === 'video') return { scale: videoScale, panX: videoPanX, panY: videoPanY }
    return { scale: 1, panX: 0, panY: 0 }
  }

  $effect(() => {
    if (!selectedFile || videoDuration <= 0) return
    if (uploadMode !== 'video') return

    const signature = [
      selectedFile.name,
      selectedFile.size,
      selectedFile.lastModified,
      videoTrimStart.toFixed(2),
      videoTrimEnd.toFixed(2),
      videoFps,
    ].join('|')

    if (signature === videoCacheSignature) return
    const timeout = setTimeout(() => {
      videoCacheSignature = signature
      prepareVideoLiveFrames().catch((err) => log(`Video cache failed: ${(err as Error).message}`))
    }, 260)

    return () => clearTimeout(timeout)
  })

  $effect(() => {
    if (uploadMode !== 'qr' || isWriting || isGeneratingQr) return
    const targetUrl = qrUrl.trim()
    if (!targetUrl) return

    const signature = [
      targetUrl,
      qrDarkColor,
      qrLightColor,
      qrDotStyle,
      qrOutsideMode,
      qrZoom.toFixed(3),
      qrRotation.toFixed(1),
    ].join('|')
    if (signature === qrAutoSignature) return

    const timeout = setTimeout(() => {
      qrAutoSignature = signature
      generateQr()
    }, 120)

    return () => clearTimeout(timeout)
  })

  $effect(() => {
    return () => {
      resetVideoScrubber()
    }
  })

  $effect(() => {
    if (isWriting || isGeneratingPreview || uploadMode === 'pattern' || uploadMode === 'qr' || uploadMode === 'gif') return

    if (uploadMode === 'image' && imagePreviewMode === 'preview' && imageLiveFrames.length > 0 && selectedFile) {
      const signature = [
        'image',
        selectedFile.name,
        selectedFile.size,
        selectedFile.lastModified,
        imageScale.toFixed(3),
        imagePanX.toFixed(3),
        imagePanY.toFixed(3),
      ].join('|')
      if (signature === autoPreviewSignature) return
      const timeout = setTimeout(() => {
        autoPreviewSignature = signature
        generatePreview()
      }, 120)
      return () => clearTimeout(timeout)
    }

    if (uploadMode === 'images' && sequencePreviewMode === 'preview' && sequenceLiveFrames.length > 0) {
      const filesSig = selectedFiles.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join(',')
      const signature = [
        'images',
        filesSig,
        sequenceFps,
        sequenceScale.toFixed(3),
        sequencePanX.toFixed(3),
        sequencePanY.toFixed(3),
      ].join('|')
      if (signature === autoPreviewSignature) return
      const timeout = setTimeout(() => {
        autoPreviewSignature = signature
        generatePreview()
      }, 180)
      return () => clearTimeout(timeout)
    }

    if (uploadMode === 'video' && videoPreviewMode === 'preview' && videoLiveFrames.length > 0 && selectedFile) {
      const signature = [
        'video',
        selectedFile.name,
        selectedFile.size,
        selectedFile.lastModified,
        videoTrimStart.toFixed(2),
        videoTrimEnd.toFixed(2),
        videoFps,
        videoScale.toFixed(3),
        videoPanX.toFixed(3),
        videoPanY.toFixed(3),
      ].join('|')
      if (signature === autoPreviewSignature) return
      const timeout = setTimeout(() => {
        autoPreviewSignature = signature
        generatePreview()
      }, 220)
      return () => clearTimeout(timeout)
    }
  })

  // ─── Pattern still-image generation ───

  async function generatePatternStill(): Promise<void> {
    if (!selectedPattern) return
    isGeneratingPattern = true
    isGeneratingPreview = true
    clearPreparedState()
    clearAviPreview()

    try {
      // Most generators draw frame 0 as a representative reference of the
      // motion (steady state for noise-y patterns, zero-phase for waves).
      // Generating just one frame is ~12-30x faster than the prior 30-frame
      // sample-and-pick: instant feedback when toggling Still mode.
      activePatternJob?.cancel()
      const handle = generatePatternInWorker(selectedPattern.generatorKey, { frames: 1, fps: patternFps })
      activePatternJob = handle
      const oneFrame = await handle.result
      activePatternJob = null
      const stillJpeg = await resizeJpegToOutput(oneFrame[0], getOutputFrameSize())

      preparedPayload = stillJpeg
      preparedIsStillImage = true
      preparedPayloadLabel = `${selectedPattern.name} still · ${formatBytes(stillJpeg.length)}`

      revokePreviewUrl()
      previewUrl = URL.createObjectURL(makeBlob(stillJpeg, 'image/jpeg'))
      log(`Still ready: ${selectedPattern.name}, ${formatBytes(stillJpeg.length)}`)
    } catch (err) {
      if (!(err instanceof PatternCancelledError)) {
        log(`Still generation failed: ${(err as Error).message}`)
      }
    } finally {
      isGeneratingPattern = false
      isGeneratingPreview = false
    }
  }

  function fontStackFor(textGen: typeof import('./text-generator'), id: string): string {
    return textGen.TEXT_FONTS.find(f => f.id === id)?.stack ?? textGen.TEXT_FONTS[0].stack
  }

  async function generateTextBytes(): Promise<{ bytes: Uint8Array; isStill: boolean }> {
    const isStill = textEffect === 'static'
    const textGen = await loadTextGen()
    const frames = await textGen.generateTextFrames({
      text,
      effect: textEffect,
      fontFamily: fontStackFor(textGen, textFontId),
      fontWeight: 800,
      color: textColor,
      background: textBackground,
      frames: isStill ? 1 : textFrames,
      fps: textFps,
    })
    if (isStill) {
      return { bytes: frames[0], isStill: true }
    }
    const out = getOutputFrameSize()
    const fitted = await fitJpegFramesToBudget(frames, out.width, out.height, MAX_UPLOAD_BYTES, log)
    if (!fitted.fits) {
      log(`⚠️ Could not fit text "${text}" under ${formatBytes(MAX_UPLOAD_BYTES)} (got ${formatBytes(fitted.totalBytes)}).`)
    } else if (fitted.quality < 1) {
      log(`Auto-shrunk text frames to JPEG quality ${fitted.quality.toFixed(2)} to fit budget.`)
    }
    return { bytes: buildMjpgAvi(fitted.frames, { fps: textFps }), isStill: false }
  }

  async function generateTextStill(): Promise<void> {
    isGeneratingPattern = true
    isGeneratingPreview = true
    clearPreparedState()
    clearAviPreview()
    try {
      const { bytes } = await generateTextBytes()
      preparedPayload = bytes
      preparedIsStillImage = true
      preparedPayloadLabel = `Text "${text || ' '}" · ${formatBytes(bytes.length)}`
      revokePreviewUrl()
      previewUrl = URL.createObjectURL(makeBlob(bytes, 'image/jpeg'))
    } catch (err) {
      log(`Text still failed: ${(err as Error).message}`)
    } finally {
      isGeneratingPattern = false
      isGeneratingPreview = false
    }
  }

  function hashString(input: string): number {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }

  function createRng(seed: number): () => number {
    let t = seed >>> 0
    return () => {
      t += 0x6D2B79F5
      let r = Math.imul(t ^ (t >>> 15), t | 1)
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }

  function drawStyledCell(
    ctx: OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    style: QrCellStyle,
    color: string,
  ): void {
    ctx.fillStyle = color
    if (style === 'square') {
      ctx.fillRect(x, y, size, size)
      return
    }
    if (style === 'round') {
      const r = size / 2
      ctx.beginPath()
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
      ctx.fill()
      return
    }

    const radius = size * 0.32
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + size - radius, y)
    ctx.quadraticCurveTo(x + size, y, x + size, y + radius)
    ctx.lineTo(x + size, y + size - radius)
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size)
    ctx.lineTo(x + radius, y + size)
    ctx.quadraticCurveTo(x, y + size, x, y + size - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
    ctx.fill()
  }

  async function generateQrJpegBytes(): Promise<Uint8Array> {
    const targetUrl = qrUrl.trim()
    if (!targetUrl) throw new Error('Enter a URL for QR generation.')

    const QRCode = await loadQrcode()
    const qr = QRCode.create(targetUrl, { errorCorrectionLevel: 'M' })
    const moduleCount = qr.modules.size
    const output = getOutputFrameSize()
    const canvas = new OffscreenCanvas(output.width, output.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create QR canvas context.')

    const qrCanvasBg = '#d8dbe4'
    ctx.fillStyle = qrCanvasBg
    ctx.fillRect(0, 0, output.width, output.height)

    const motif = Math.max(1, Math.floor(Math.min(output.width, output.height) * (332 / 368)))
    const quietModules = 2
    const outerBandModules = 10
    const totalGridModules = moduleCount + (quietModules + outerBandModules) * 2
    const modulePx = Math.max(1, Math.floor(motif / totalGridModules))
    const gridPx = modulePx * totalGridModules
    const qrPx = moduleCount * modulePx
    const quietPx = quietModules * modulePx

    const seed = hashString([
      targetUrl,
      qrDarkColor,
      qrLightColor,
      qrDotStyle,
      qrOutsideMode,
      qrZoom.toFixed(3),
      qrRotation.toFixed(1),
    ].join('|'))
    const rng = createRng(seed)

    ctx.save()
    ctx.translate(output.width / 2, output.height / 2)
    ctx.rotate((qrRotation * Math.PI) / 180)
    ctx.scale(qrZoom, qrZoom)

    // Center the integer-sized grid so module pitch is exact and derived from QR data.
    const gridOffset = -gridPx / 2

    const coreWithQuietModules = moduleCount + quietModules * 2
    const innerHalf = (coreWithQuietModules * modulePx) / 2
    const cellSize = modulePx * 0.9
    const cellInset = (modulePx - cellSize) / 2

    const center = totalGridModules / 2
    const outerStart = 0
    const outerEndExclusive = totalGridModules
    const coreStart = outerBandModules
    const coreEndExclusive = totalGridModules - outerBandModules
    const qrStart = outerBandModules + quietModules

    if (qrOutsideMode === 'on') {
      for (let row = outerStart; row < outerEndExclusive; row++) {
        for (let col = outerStart; col < outerEndExclusive; col++) {
          const inCore = row >= coreStart && row < coreEndExclusive && col >= coreStart && col < coreEndExclusive
          if (inCore) continue

          const x = gridOffset + col * modulePx
          const y = gridOffset + row * modulePx
          const color = rng() > 0.5 ? qrDarkColor : qrLightColor
          drawStyledCell(ctx, x + cellInset, y + cellInset, cellSize, qrDotStyle, color)
        }
      }
    }

    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        const isDark = qr.modules.get(row, col)
        const x = gridOffset + (qrStart + col) * modulePx
        const y = gridOffset + (qrStart + row) * modulePx
        const color = isDark ? qrDarkColor : qrLightColor
        drawStyledCell(ctx, x + cellInset, y + cellInset, cellSize, qrDotStyle, color)
      }
    }

    ctx.restore()

    return canvasToBadgeJpeg(canvas, 0.92)
  }

  async function generateQr(): Promise<void> {
    isGeneratingQr = true
    clearPreparedState()
    clearAviPreview()
    try {
      const jpeg = await generateQrJpegBytes()
      preparedPayload = jpeg
      preparedIsStillImage = true
      preparedPayloadLabel = `QR image · ${formatBytes(jpeg.length)}`
      revokePreviewUrl()
      previewUrl = URL.createObjectURL(makeBlob(jpeg, 'image/jpeg'))
    } catch {
      // Keep QR auto-regeneration silent to avoid log clutter.
    } finally {
      isGeneratingQr = false
    }
  }

  // ─── Preview generation ───

  async function generatePreview(): Promise<void> {
    isGeneratingPreview = true
    clearPreparedState()
    clearAviPreview()
    revokePreviewUrl()
    previewUrl = null

    try {
      let avi: Uint8Array
      let label: string

      if (uploadMode === 'image') {
        if (imageLiveFrames.length === 0) throw new Error('No image selected')
        const imageJpeg = await previewBitmapToJpeg(imageLiveFrames[0], getTransform('image'), getOutputFrameSize())
        preparedPayload = imageJpeg
        preparedIsStillImage = true
        preparedPayloadLabel = `Image preview · ${formatBytes(imageJpeg.length)}`
        previewUrl = URL.createObjectURL(makeBlob(imageJpeg, 'image/jpeg'))
        log(`Image preview ready: ${formatBytes(imageJpeg.length)}`)
        return
      }

      if (uploadMode === 'images') {
        if (sequenceLiveFrames.length === 0) throw new Error('No images selected')
        avi = await previewBitmapsToAvi(sequenceLiveFrames, sequenceFps, getTransform('images'), log, getOutputFrameSize())
        label = `${sequenceLiveFrames.length} cached images @ ${sequenceFps}fps`
      } else if (uploadMode === 'video') {
        if (videoLiveFrames.length === 0) throw new Error('No video selected')
        avi = await previewBitmapsToAvi(videoLiveFrames, videoFps, getTransform('video'), log, getOutputFrameSize())
        label = `Video ${videoTrimStart.toFixed(1)}s-${videoTrimEnd.toFixed(1)}s @ ${videoFps}fps`
      } else if (uploadMode === 'pattern') {
        if (!selectedPattern) throw new Error('No pattern selected')
        const built = await buildPatternAvi(selectedPattern)
        avi = built.avi
        label = built.label
      } else if (uploadMode === 'text') {
        if (textEffect === 'static') {
          // For static text, route through the still-image path instead.
          await generateTextStill()
          return
        }
        if (!text.trim()) throw new Error('Type some text first')
        isGeneratingPattern = true
        const result = await generateTextBytes()
        avi = result.bytes
        label = `"${text}" · ${textFrames} frames @ ${textFps}fps`
        isGeneratingPattern = false
      } else {
        throw new Error('Preview only for sequence/video/pattern modes')
      }

      if (avi.length > MAX_UPLOAD_BYTES) {
        log(`⚠️ Generated AVI is ${formatBytes(avi.length)}, exceeds ${formatBytes(MAX_UPLOAD_BYTES)} limit!`)
      }

      aviPreviewFps = readAviFps(avi)
      aviPreviewFrames = await parseAviFrames(avi)
      preparedPayload = avi
      preparedPayloadLabel = `${label} · ${formatBytes(avi.length)}`
      log(`Preview ready: ${aviPreviewFrames.length} frames @ ${aviPreviewFps}fps, ${formatBytes(avi.length)}`)

      // Let component mount, then start playback
      requestAnimationFrame(() => aviPlayer?.startPreview())
    } catch (err) {
      if (!(err instanceof PatternCancelledError)) {
        log(`Preview failed: ${(err as Error).message}`)
      }
    } finally {
      isGeneratingPreview = false
      isGeneratingPattern = false
    }
  }

  // ─── GIF mode result handler ───

  async function handleGifResult(avi: Uint8Array, fps: number): Promise<void> {
    clearPreparedState()
    clearAviPreview()

    preparedPayload = avi
    preparedPayloadLabel = `GIF @ ${fps} fps - ${formatBytes(avi.length)}`
    aviPreviewFps = fps
    aviPreviewFrames = await parseAviFrames(avi)

    log(`GIF ready: ${aviPreviewFrames.length} frames @ ${fps} fps, ${formatBytes(avi.length)}`)
    requestAnimationFrame(() => aviPlayer?.startPreview())
  }

  // ─── Get upload bytes ───

  async function getUploadBytes(): Promise<Uint8Array> {
    const bytes = await getUploadBytesRaw()
    // Strip browser-injected ICC/EXIF APP segments from JPEGs. No-op for
    // AVI (RIFF magic doesn't match FFD8). Fixes the on-device "first few
    // rows only" rendering bug caused by Jieli's MJPEG decoder choking on
    // Chromium's color-profile chunk.
    return sanitizeJpegForBadge(bytes)
  }

  async function getUploadBytesRaw(): Promise<Uint8Array> {
    if (preparedPayload) {
      log(`Using prepared payload: ${formatBytes(preparedPayload.length)}`)
      return preparedPayload
    }

    if (uploadMode === 'image') {
      if (imageLiveFrames.length === 0 && selectedFile) await prepareImageLiveFrames()
      if (imageLiveFrames.length === 0) throw new Error('No image selected.')
      return previewBitmapToJpeg(imageLiveFrames[0], getTransform('image'), getOutputFrameSize())
    }
    if (uploadMode === 'images') {
      if (sequenceLiveFrames.length === 0 && selectedFiles.length > 0) await prepareSequenceLiveFrames()
      if (sequenceLiveFrames.length === 0) throw new Error('No sequence selected.')
      return previewBitmapsToAvi(sequenceLiveFrames, sequenceFps, getTransform('images'), log, getOutputFrameSize())
    }
    if (uploadMode === 'video') {
      if (videoLiveFrames.length === 0 && selectedFile) await prepareVideoLiveFrames()
      if (videoLiveFrames.length === 0) throw new Error('No video frames cached.')
      return previewBitmapsToAvi(videoLiveFrames, videoFps, getTransform('video'), log, getOutputFrameSize())
    }
    if (uploadMode === 'gif') {
      if (!preparedPayload) throw new Error('No GIF processed. Drop a GIF file first.')
      return preparedPayload
    }
    if (uploadMode === 'pattern') {
      if (!selectedPattern) throw new Error('No pattern selected.')
      // Same helper the preview uses, so a Send right after a Preview
      // hits the LRU cache instead of re-running the whole pipeline.
      const built = await buildPatternAvi(selectedPattern)
      return built.avi
    }
    if (uploadMode === 'qr') {
      return generateQrJpegBytes()
    }
    if (uploadMode === 'text') {
      const { bytes } = await generateTextBytes()
      return bytes
    }
    throw new Error(`Unknown upload mode: ${uploadMode}`)
  }

  function resolveUploadModeForDevice(): UploadMode {
    if (uploadMode === 'qr') return 'image'
    if (uploadMode === 'gif') return 'video'
    if (uploadMode === 'text') return textEffect === 'static' ? 'image' : 'pattern'
    if (preparedIsStillImage) return 'image'
    return uploadMode
  }

  async function downloadGenerated(): Promise<void> {
    try {
      const payload = await getUploadBytes()
      const deviceMode = resolveUploadModeForDevice()
      const ext = deviceMode === 'image' ? 'jpg' : 'avi'
      const mime = deviceMode === 'image' ? 'image/jpeg' : 'video/x-msvideo'
      const blob = makeBlob(payload, mime)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `badge-${uploadMode}-${Date.now()}.${ext}`
      link.click()
      URL.revokeObjectURL(url)
      log(`Downloaded generated ${ext.toUpperCase()} (${formatBytes(payload.length)})`)
    } catch (err) {
      log(`Download failed: ${(err as Error).message}`)
    }
  }

  // ─── Upload orchestration ───

  /**
   * Fallback path: when the badge rejects a payload (status=0x01, gallery
   * almost full), encode the FIRST frame of the current selection as a
   * tiny static JPEG (~6-20 KB) and send that instead. Even with a
   * near-full gallery the badge can almost always fit one fresh static
   * slot - this gets the user *something* on the badge and proves the BLE
   * pipe is healthy. After this succeeds, the filename-pin patch in
   * server.py overwrites the same slot on every subsequent send.
   */
  async function sendTinyRecoveryImage(): Promise<void> {
    if (!conn && !httpConn) {
      status = 'Not connected.'
      return
    }
    isWriting = true
    cancelRequested = false
    progress = 0
    progressLabel = 'Building tiny recovery JPEG…'
    sentBytesForEta = 0
    totalBytesForEta = 0
    try {
      // Pick a source bitmap - first AVI preview frame, else first live
      // bitmap, else first selected file, else the prepared payload (if
      // it's already a JPEG).
      let bitmap: ImageBitmap | null = null
      if (aviPreviewFrames.length > 0) {
        const f0 = aviPreviewFrames[0]
        bitmap = await createImageBitmap(f0 as unknown as ImageBitmapSource)
      } else if (imageLiveFrames.length > 0) {
        bitmap = await createImageBitmap(imageLiveFrames[0] as unknown as ImageBitmapSource)
      } else if (sequenceLiveFrames.length > 0) {
        bitmap = await createImageBitmap(sequenceLiveFrames[0] as unknown as ImageBitmapSource)
      } else if (videoLiveFrames.length > 0) {
        bitmap = await createImageBitmap(videoLiveFrames[0] as unknown as ImageBitmapSource)
      } else if (selectedFile) {
        bitmap = await createImageBitmap(selectedFile)
      } else if (selectedFiles[0]) {
        bitmap = await createImageBitmap(selectedFiles[0])
      } else if (preparedPayload && preparedIsStillImage) {
        // Already a JPEG; just resend it as a static
        const tinyBytes = preparedPayload
        log(`Tiny recovery: reusing prepared still (${formatBytes(tinyBytes.length)})`)
        await sendBytesAsStill(tinyBytes)
        return
      }
      if (!bitmap) {
        status = 'No source frame available for tiny recovery. Pick something first.'
        return
      }
      // Render at 368x368 with conservative quality, bracketing down until
      // we are well below 30 KB so it fits even in a near-full gallery.
      const target = 25_000
      const qualitySteps = [0.7, 0.55, 0.45, 0.35, 0.25, 0.18]
      let bytes: Uint8Array | null = null
      for (const q of qualitySteps) {
        const canvas = new OffscreenCanvas(368, 368)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('No 2D context for recovery JPEG')
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, 368, 368)
        // Center-crop / fit
        const scale = Math.max(368 / bitmap.width, 368 / bitmap.height)
        const dw = bitmap.width * scale
        const dh = bitmap.height * scale
        ctx.drawImage(bitmap, (368 - dw) / 2, (368 - dh) / 2, dw, dh)
        const buf = canvasToBadgeJpeg(canvas, q)
        bytes = buf
        if (buf.length <= target) break
      }
      bitmap.close?.()
      if (!bytes) throw new Error('Recovery JPEG encoding failed')
      log(`Tiny recovery JPEG ready: ${formatBytes(bytes.length)}`)
      await sendBytesAsStill(bytes)
    } catch (e) {
      const msg = (e as Error).message || String(e)
      status = `Tiny recovery failed: ${msg}`
      log(status)
    } finally {
      isWriting = false
      progress = 0
      progressLabel = ''
    }
  }

  async function sendBytesAsStill(rawPayload: Uint8Array): Promise<void> {
    // Strip browser-injected ICC/EXIF APP segments - Jieli decoder bug.
    const payload = sanitizeJpegForBadge(rawPayload)
    uploadStartTime = Date.now()
    totalBytesForEta = payload.length
    if (httpConn) {
      progressLabel = `Tiny recovery: sending ${formatBytes(payload.length)} via HTTP backend…`
      progress = 5
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(payload)], { type: 'image/jpeg' }), 'recovery.jpg')
      fd.append('kind', 'still')
      const httpAbort = new AbortController()
      currentHttpAbort = httpAbort
      const pollProgress = async () => {
        try {
          const r = await fetch('/api/status', { cache: 'no-store' })
          if (!r.ok) return
          const d = await r.json()
          backendState = d.state ?? null
          backendDetail = d.detail ?? ''
          if (d.progress?.percent != null) {
            progress = d.progress.percent
            progressLabel = `${d.progress.percent}% · recovery JPEG (backend)`
          }
        } catch { /* ignore */ }
      }
      void pollProgress()
      const pollHandle = setInterval(pollProgress, 750)
      try {
        const r = await fetch('/api/blob', { method: 'POST', body: fd, signal: httpAbort.signal })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((d && d.detail) || `HTTP ${r.status}`)
      } finally {
        clearInterval(pollHandle)
        currentHttpAbort = null
      }
      progress = 100
      sentBytesForEta = payload.length
      status = `🎯 Tiny recovery image sent (${formatBytes(payload.length)}). Try a normal upload now.`
      log(status)
    } else if (conn) {
      progressLabel = `Tiny recovery: sending ${formatBytes(payload.length)} via Web Bluetooth…`
      await writeFileE87({
        conn,
        payload,
        uploadMode: 'image',
        interChunkDelayMs,
        cancelRequested: () => cancelRequested,
        log,
        onProgress: (sent, total) => {
          sentBytesForEta = sent
          progress = Math.min(100, Math.round((sent / total) * 100))
          progressLabel = `${progress}% · recovery JPEG`
        },
      })
      status = `🎯 Tiny recovery image sent (${formatBytes(payload.length)}). Try a normal upload now.`
      log(status)
    }
  }

  async function startUpload(): Promise<void> {
    if (!conn && !httpConn) {
      status = 'Not connected.'
      return
    }
    // Auto-reconnect for BLE mode: if the GATT server dropped between
    // sessions, transparently request the device again before we proceed.
    if (conn && !conn.device.gatt?.connected) {
      log('Stale BLE connection detected. Auto-reconnecting before upload…')
      conn = null
      await connect()
      if (!conn) {
        status = 'Auto-reconnect failed. Click Connect to try again.'
        return
      }
    }
    if (uploadMode === 'image' && !selectedFile && !preparedPayload) {
      status = 'Select an image.'
      return
    }
    if (uploadMode === 'images' && selectedFiles.length === 0) {
      status = 'Select images for the sequence.'
      return
    }
    if (uploadMode === 'video' && !selectedFile) {
      status = 'Select a video file.'
      return
    }
    if (uploadMode === 'pattern' && !selectedPattern) {
      status = 'Select a pattern.'
      return
    }
    if (uploadMode === 'qr' && !qrUrl.trim()) {
      status = 'Enter a URL for QR mode.'
      return
    }
    if (uploadMode === 'text' && !text.trim()) {
      status = 'Type some text first.'
      return
    }

    isWriting = true
    cancelRequested = false
    progress = 0
    progressLabel = 'Starting…'
    sentBytesForEta = 0
    totalBytesForEta = 0
    uploadStartTime = 0

    try {
      aviPlayer?.stop()
      const payload = await getUploadBytes()
      const uploadModeForDevice = resolveUploadModeForDevice()

      if (payload.length > MAX_UPLOAD_BYTES) {
        throw new Error(`File too large: ${formatBytes(payload.length)} exceeds ${formatBytes(MAX_UPLOAD_BYTES)} limit.`)
      }

      if (uploadModeForDevice === 'image') {
        revokePreviewUrl()
        previewUrl = URL.createObjectURL(makeBlob(payload, 'image/jpeg'))
      }

      uploadStartTime = Date.now()
      totalBytesForEta = payload.length

      if (httpConn) {
        // HTTP backend path - server handles the BLE side.
        progressLabel = `Uploading ${formatBytes(payload.length)} via HTTP backend…`
        progress = 5
        const fd = new FormData()
        const filename = preparedIsStillImage ? 'still.jpg' : 'frames.avi'
        const mime = preparedIsStillImage ? 'image/jpeg' : 'video/avi'
        fd.append('file', new Blob([new Uint8Array(payload)], { type: mime }), filename)
        fd.append('kind', preparedIsStillImage ? 'still' : 'animated')
        // Real progress comes from polling /api/status while the request
        // is in flight - the FastAPI backend parses the e87_badge lib's
        // own log lines and updates state.detail with percent + bytes.
        const httpAbort = new AbortController()
        currentHttpAbort = httpAbort
        let pollHandle: ReturnType<typeof setInterval> | null = null
        let lastPct = 0
        const pollProgress = async () => {
          try {
            const r = await fetch('/api/status', { cache: 'no-store' })
            if (!r.ok) return
            const d = await r.json()
            backendState = d.state ?? null
            backendDetail = d.detail ?? ''
            if (d.progress && typeof d.progress.percent === 'number') {
              lastPct = d.progress.percent
              progress = lastPct
              const total = d.progress.total_bytes || payload.length
              const sent = Math.floor((lastPct / 100) * total)
              sentBytesForEta = sent
              totalBytesForEta = total
              progressLabel = `${lastPct}% · ${formatBytes(sent)} / ${formatBytes(total)} (backend)`
            } else {
              // Pre-transfer phase: show the backend's detail message
              progressLabel = d.detail
                ? `${d.state}: ${d.detail}`
                : `${d.state ?? 'working'}…`
            }
          } catch { /* ignore poll errors */ }
        }
        void pollProgress()
        pollHandle = setInterval(pollProgress, 750)
        try {
          const r = await fetch('/api/blob', { method: 'POST', body: fd, signal: httpAbort.signal })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error((d && d.detail) || `HTTP ${r.status}`)
        } finally {
          if (pollHandle) clearInterval(pollHandle)
          currentHttpAbort = null
        }
        progress = 100
        sentBytesForEta = payload.length
        const elapsed = formatDuration((Date.now() - uploadStartTime) / 1000)
        status = `Upload completed in ${elapsed} (HTTP backend).`
        log(status)
        return
      }

      await writeFileE87({
        conn: conn!,
        payload,
        uploadMode: uploadModeForDevice,
        interChunkDelayMs,
        cancelRequested: () => cancelRequested,
        onProgress: (bytesSent, totalBytes, chunksSent, totalChunks) => {
          sentBytesForEta = bytesSent
          const pct = Math.min(100, Math.round((bytesSent / totalBytes) * 100))
          progress = pct
          progressLabel = `${pct}% · ${formatBytes(bytesSent)} / ${formatBytes(totalBytes)} · chunk ${chunksSent}/${totalChunks}`
        },
        log,
      })

      progress = 100
      const elapsed = formatDuration((Date.now() - uploadStartTime) / 1000)
      status = `Upload completed in ${elapsed}.`
    } catch (error) {
      status = `Upload failed: ${(error as Error).message}`
      log(status)
      // Auto-run diagnostics so the verdict surfaces inline without the
      // user having to know about the help drawer.
      if (!hasWebBluetooth && !cancelRequested) {
        log('Auto-running diagnostics to identify cause…')
        void runDiagnostics()
      }
    } finally {
      isWriting = false
    }
  }

  function cancelWrite(): void {
    cancelRequested = true
    log('Cancel requested.')
    // HTTP-fallback path: abort the fetch and tell the server to drop
    // its in-flight BLE transfer.
    if (currentHttpAbort) {
      try { currentHttpAbort.abort() } catch { /* ignore */ }
    }
    if (!hasWebBluetooth) {
      void fetch('/api/cancel', { method: 'POST' }).catch(() => {})
    }
  }

  async function runDiagnostics(): Promise<void> {
    if (hasWebBluetooth) {
      log('Diagnostics is HTTP-backend only. Switch to Safari/Firefox or use the device picker on Chrome.')
      return
    }
    isRunningDiagnostics = true
    log('Running backend diagnostics (scan + connect)…')
    try {
      const r = await fetch('/api/diagnostics', { cache: 'no-store' })
      const d = await r.json()
      log(`Diagnostics verdict: ${d.verdict}${d.detail ? `, ${d.detail}` : ''}`)
      if (d.scan_seconds !== undefined) log(`  scan: ${d.scan_seconds}s, found=${!!d.scan_found}`)
      if (d.connect_seconds !== undefined) log(`  connect: ${d.connect_seconds}s`)
      log(`  scanner_alive=${d.scanner_alive}, cache_age=${d.cache_age_seconds ?? 'n/a'}s`)
      diagnosticsResult = d
    } catch (e) {
      log(`Diagnostics failed: ${(e as Error).message}`)
    } finally {
      isRunningDiagnostics = false
    }
  }

  async function bustCache(): Promise<void> {
    if (hasWebBluetooth) return
    try {
      await fetch('/api/cache/bust', { method: 'POST' })
      log('Backend BLE cache cleared. Next send will do a fresh scan.')
    } catch (e) {
      log(`Cache-bust failed: ${(e as Error).message}`)
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && helpOpen) helpOpen = false }} />
<svelte:body class:overflow-hidden={helpOpen} />

<!-- Subtle circuit-board texture wash - sits behind everything, opacity 6% -->
<div class="fixed inset-0 bg-circuit-pattern opacity-[0.06] pointer-events-none z-0" aria-hidden="true"></div>

<div class="relative z-10 flex flex-col h-screen overflow-hidden">
  <!-- ═══ M3 Top App Bar ═══ -->
  <M3TopAppBar elevated class="!fixed !top-0 !left-0 !right-0">
    {#snippet leading()}
      <div class="flex items-center gap-2.5">
        <AuraCastLogo3D size={40} />
        <div class="hidden sm:flex items-baseline gap-px text-headline-sm tracking-tight leading-none">
          <span class="font-semibold text-on-surface">Aura</span><span class="font-semibold bg-gradient-to-r from-tertiary to-primary bg-clip-text text-transparent">Cast</span>
        </div>
      </div>
    {/snippet}
    {#snippet trailing()}
      <!-- Live BLE status pill -->
      <div class="flex items-center gap-2 px-3 h-9 rounded-full bg-surface-container-high">
        <M3Icon
          name={(conn?.server?.connected || httpConn) ? 'bluetooth_connected' : badgeOnline ? 'bluetooth_searching' : 'bluetooth_disabled'}
          size={18}
          class={(conn?.server?.connected || httpConn) ? 'text-primary' : badgeOnline ? 'text-tertiary' : 'text-on-surface-variant'}
        />
        <span class="text-label-md tabular-nums">
          {(conn?.server?.connected || httpConn) ? 'Live' : badgeOnline ? 'Online' : hasWebBluetooth ? 'Idle' : 'Asleep'}
        </span>
        <span class="w-2 h-2 rounded-full {(conn?.server?.connected || httpConn) ? 'bg-primary shadow-[0_0_8px_var(--md-sys-color-primary)]' : badgeOnline ? 'bg-tertiary shadow-[0_0_8px_var(--md-sys-color-tertiary)] animate-pulse' : 'bg-outline'}"></span>
      </div>
      {#if batteryLevel !== null}
        <div class="hidden md:flex items-center gap-1.5 px-3 h-9 rounded-full bg-surface-container-high">
          <M3Icon name={batteryCharging ? 'battery_charging_full' : (batteryLevel > 80 ? 'battery_full' : batteryLevel > 30 ? 'battery_5_bar' : 'battery_1_bar')} size={18} class={batteryLevel > 30 ? 'text-primary' : 'text-error'} />
          <span class="text-label-md tabular-nums">{batteryLevel}%</span>
          {#if batteryCharging}<span class="text-label-sm text-tertiary">&#9889;</span>{/if}
        </div>
      {/if}
      {#if brightnessLevel !== null}
        <div class="hidden md:flex items-center gap-2 px-3 h-9 rounded-full bg-surface-container-high">
          <M3Icon name="brightness_medium" size={18} class="text-primary" />
          <input type="range" min="0" max="100" value={brightnessLevel}
            oninput={debouncedSetBrightness}
            class="w-20 h-1 accent-[var(--md-sys-color-primary)] cursor-pointer" />
          <span class="text-label-sm tabular-nums w-7 text-right">{brightnessLevel}%</span>
        </div>
      {/if}
      {#if (conn?.server?.connected || httpConn)}
        <M3IconButton icon="link_off" ariaLabel="Disconnect" disabled={isWriting} onclick={disconnect} />
      {:else}
        <M3IconButton icon={isConnecting ? 'autorenew' : 'link'} ariaLabel={isConnecting ? 'Connecting' : 'Connect'} disabled={isConnecting || isWriting} onclick={connect} variant="filled" />
      {/if}
      <M3IconButton
        icon={colorSchemeIcon}
        ariaLabel={colorSchemeLabel}
        onclick={onThemeClick}
        onpointerdown={onThemePointerDown}
        onpointerup={onThemePointerUp}
        onpointerleave={onThemePointerUp}
        onpointercancel={onThemePointerUp}
      />
      <M3IconButton icon="help" ariaLabel="Help and troubleshooting" onclick={() => helpOpen = !helpOpen} />
    {/snippet}
  </M3TopAppBar>

  <div class="flex flex-1 pt-16 h-full">
    <!-- ═══ M3 Navigation Rail (md+) ═══ -->
    <div class="hidden lg:block shrink-0 sticky top-16 self-start h-[calc(100vh-4rem)]">
      <M3NavigationRail
        destinations={MODE_TABS.map(t => ({ value: t.id, label: t.label, icon: t.icon }))}
        value={uploadMode}
        onchange={(v) => switchMode(v)}
        class="!h-full"
      >
        {#snippet footer()}
          {#if !hasWebBluetooth}
            <M3IconButton icon="stethoscope" ariaLabel="Run diagnostics" disabled={isRunningDiagnostics || isWriting} onclick={runDiagnostics} variant="tonal" />
          {/if}
          <M3IconButton icon="help" ariaLabel="Help and troubleshooting" onclick={() => helpOpen = !helpOpen} variant="tonal" />
        {/snippet}
      </M3NavigationRail>
    </div>

    <!-- ═══ Main canvas ═══ -->
    <main class="flex-1 overflow-y-auto p-4 md:p-5 lg:px-6 lg:py-4 pb-[calc(env(safe-area-inset-bottom)+88px)] lg:pb-4 bg-surface flex justify-center">
      <div class="w-full max-w-[1280px] flex flex-col gap-3">
        <!-- Page header. Compact-height viewports (≤820px) hide the intro
             paragraph because it pushes the bottom row out of the fold. -->
        <header class="flex flex-col gap-1 page-header">
          <h1 class="text-headline-sm font-semibold text-on-surface flex items-center gap-2.5 leading-tight">
            <span class="material-symbols-outlined text-[22px] text-primary" aria-hidden="true">{MODE_HEADER[uploadMode].icon}</span>{MODE_HEADER[uploadMode].title}
          </h1>
          <p class="text-body-sm text-on-surface-variant max-w-3xl leading-snug page-intro">{MODE_HEADER[uploadMode].intro}</p>
        </header>

        <!-- Mobile mode tabs replaced by sticky bottom nav (see end of layout). Keep this only as md/lg fallback if ever needed. -->
        <div class="hidden"></div>

        <!-- Connection / wake banners -->
        {#if !hasWebBluetooth && backendState === 'error' && backendDetail.includes('rejected')}
          <M3Card variant="outlined" class="p-5 flex gap-4 border-error/40 bg-error-container/20">
            <span class="material-symbols-outlined text-error text-[28px] shrink-0">warning</span>
            <div class="flex-1 min-w-0">
              <div class="text-title-md font-semibold text-error mb-1">Badge's gallery is full. Clear it via Zrun app</div>
              <ol class="list-decimal pl-5 space-y-1 text-body-sm text-on-surface-variant">
                <li>The badge has ~970 KB of internal flash. Past uploads each used a unique filename and accumulated until full. <b class="text-on-surface">The web UI now pins all uploads to one slot, but existing garbage must be cleared once.</b></li>
                <li><b class="text-on-surface">Quickest fix:</b> click <b>🎯 Send tiny recovery image</b> below. We compress the first frame of your selection to ~15&nbsp;KB and send it as a static. That almost always fits even with a near-full gallery, and from then on every send overwrites the same slot.</li>
                <li>If that fails too, install <a class="text-primary underline" href="https://apps.apple.com/app/zrun/id1581007145" target="_blank" rel="noopener">Zrun</a>, pair the badge, open the gallery, and <b class="text-on-surface">delete all stored images</b>.</li>
                <li>Power-cycle the badge if sends hang at 0% rather than rejecting (hold side button until off, wait 3 s, press to power on).</li>
              </ol>
              <div class="mt-3 flex flex-wrap gap-2">
                <M3Button variant="filled" size="md" icon="healing" disabled={isWriting || (!conn && !httpConn)} onclick={sendTinyRecoveryImage}>
                  Send tiny recovery image
                </M3Button>
              </div>
            </div>
          </M3Card>
        {/if}
        {#if !hasWebBluetooth && bridgeReachable === false}
          <div class="rounded-2xl border border-tertiary/40 bg-tertiary-container/40 p-5 sm:p-6 flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <div class="shrink-0 w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
                <M3Icon name="cable" size={24} class="text-on-tertiary-container" />
              </div>
              <div class="flex flex-col gap-0.5 min-w-0">
                <h2 class="text-title-lg font-semibold text-on-surface leading-tight m-0">Set up the local bridge</h2>
                <p class="text-body-md text-on-surface-variant m-0 leading-snug">This browser doesn't speak Web Bluetooth, so the page needs a small Python relay on the same machine to reach the badge.</p>
              </div>
            </div>
            <ol class="m3-list flex flex-col gap-2.5 text-body-md text-on-surface-variant m-0 p-0 list-none">
              <li class="m3-list-item flex gap-3 items-start">
                <span aria-hidden="true" class="m3-list-num shrink-0 w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container text-label-md font-semibold flex items-center justify-center leading-none tabular-nums">1</span>
                <span class="pt-0.5">Open Chrome, Edge, Brave or Arc on desktop or Android · the badge connects directly, no relay needed.</span>
              </li>
              <li class="m3-list-item flex gap-3 items-start">
                <span aria-hidden="true" class="m3-list-num shrink-0 w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container text-label-md font-semibold flex items-center justify-center leading-none tabular-nums">2</span>
                <span class="pt-0.5">Or run the FastAPI bridge on a Mac/Linux box on the same Wi-Fi:
                  <code class="bg-surface-container px-1.5 py-0.5 rounded text-label-md">python -m uvicorn server:app --host 0.0.0.0 --port 8089</code>
                  then open <code class="bg-surface-container px-1.5 py-0.5 rounded text-label-md">http://&lt;that-box&gt;:8089/</code> in this browser.
                </span>
              </li>
              <li class="m3-list-item flex gap-3 items-start">
                <span aria-hidden="true" class="m3-list-num shrink-0 w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container text-label-md font-semibold flex items-center justify-center leading-none tabular-nums">3</span>
                <span class="pt-0.5">Full setup steps in the <a class="text-primary underline" href="https://github.com/hybridherbst/web-bluetooth-e87/tree/main/web#running-the-http-bridge-safari-firefox-ios-anything-without-web-bluetooth" target="_blank" rel="noopener">README</a>.</span>
              </li>
            </ol>
          </div>
        {/if}
        {#if !hasWebBluetooth && bridgeReachable === true && badgeOnline === false && backendState !== 'sending'}
          <div class="m3-wake-card rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6 flex flex-col gap-4">
            <div class="flex items-center gap-3">
              <div class="shrink-0 w-10 h-10 rounded-full bg-tertiary-container flex items-center justify-center">
                <M3Icon name="touch_app" size={24} class="text-on-tertiary-container" />
              </div>
              <div class="flex flex-col gap-0.5 min-w-0">
                <h2 class="text-title-lg font-semibold text-on-surface leading-tight m-0">Wake your badge</h2>
                <p class="text-body-md text-on-surface-variant m-0 leading-snug">It auto-sleeps after a couple of minutes · a quick tap brings it back.</p>
              </div>
            </div>
            <ol class="m3-list flex flex-col gap-3.5 text-body-md text-on-surface-variant m-0 p-0 list-none">
              <li class="m3-list-item flex gap-3 items-start">
                <span aria-hidden="true" class="m3-list-num shrink-0 w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container text-label-md font-semibold flex items-center justify-center leading-none tabular-nums">1</span>
                <span class="pt-0.5"><b class="text-on-surface font-semibold">Tap the side button</b> once. The screen lights up.</span>
              </li>
              <li class="m3-list-item flex gap-3 items-start">
                <span aria-hidden="true" class="m3-list-num shrink-0 w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container text-label-md font-semibold flex items-center justify-center leading-none tabular-nums">2</span>
                <span class="pt-0.5">Watch the status pill above · it turns <b class="text-on-surface font-semibold">green</b> within a second or two.</span>
              </li>
              <li class="m3-list-item flex gap-3 items-start">
                <span aria-hidden="true" class="m3-list-num shrink-0 w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container text-label-md font-semibold flex items-center justify-center leading-none tabular-nums">3</span>
                <span class="pt-0.5">Still red after 10&nbsp;s? Hold the button for ~3&nbsp;s to force-wake, then run <b class="text-on-surface font-semibold">Diagnostics</b>.</span>
              </li>
            </ol>
          </div>
        {/if}

        <!-- Mode panel + preview (Connection card deleted; connection lives in app bar) -->
        <div class="grid grid-cols-1 gap-6 items-start">
          <M3Card variant="filled" class="!rounded-2xl p-4 sm:p-5 flex flex-col gap-4 min-w-0">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <h2 class="text-title-lg text-on-surface font-semibold">{MODE_HEADER[uploadMode].panelTitle}</h2>
              {#if uploadMode === 'image'}
                <PreviewModeSwitch bind:mode={imagePreviewMode} disabled={isWriting || isGeneratingPreview} />
              {:else if uploadMode === 'images'}
                <PreviewModeSwitch bind:mode={sequencePreviewMode} disabled={isWriting || isGeneratingPreview} />
              {:else if uploadMode === 'video'}
                <PreviewModeSwitch bind:mode={videoPreviewMode} disabled={isWriting || isGeneratingPreview} />
              {/if}
            </div>

          <!-- 2-column hero/controls layout. Preview + actions on the left
               (sticky on desktop), controls on the right. Stacks on mobile
               with preview shown first. -->
          <div class="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 items-start">

            <!-- ── Hero preview column ─────────────────────────────────── -->
            <aside class="lg:sticky lg:top-20 flex flex-col gap-4 items-center order-1 lg:order-1">
              <div class="auracast-preview-hero w-full flex flex-col items-center gap-4">
                {#if uploadMode === 'pattern'}
                  {#if aviPreviewFrames.length > 0}
                    <AviPlayer bind:this={aviPlayer} frames={aviPreviewFrames} fps={aviPreviewFps} label={selectedPattern ? `${selectedPattern.name} preview` : 'Pattern preview'} />
                  {:else if previewUrl && preparedPayload}
                    <PreviewSurface size={260} busy={isGeneratingPreview}>
                      <img src={previewUrl} alt="Pattern" width="368" height="368" decoding="async" />
                    </PreviewSurface>
                  {:else}
                    <PreviewSurface
                      size={260}
                      quiet
                      empty={!selectedPattern}
                      busy={isGeneratingPreview || isGeneratingPattern}
                    >
                      {#snippet empty_()}
                        <div class="flex flex-col items-center gap-1.5 text-on-surface-variant">
                          <span class="material-symbols-outlined text-[40px] opacity-70">auto_awesome</span>
                          <span class="text-label-md font-medium">Pick a pattern to preview</span>
                        </div>
                      {/snippet}
                    </PreviewSurface>
                  {/if}
                {:else if uploadMode === 'text'}
                  {#if textEffect === 'static' && previewUrl}
                    <PreviewSurface size={260} busy={isGeneratingPreview}>
                      <img src={previewUrl} alt="Text" width="368" height="368" decoding="async" />
                    </PreviewSurface>
                  {:else if aviPreviewFrames.length > 0}
                    <AviPlayer bind:this={aviPlayer} frames={aviPreviewFrames} fps={aviPreviewFps} label={`${textEffect} text effect preview`} />
                  {:else}
                    <PreviewSurface
                      size={260}
                      quiet
                      empty={!text || !text.trim()}
                      busy={isGeneratingPreview || !!(text && text.trim())}
                    >
                      {#snippet empty_()}
                        <div class="flex flex-col items-center gap-1.5 text-on-surface-variant">
                          <span class="material-symbols-outlined text-[40px] opacity-70">text_fields</span>
                          <span class="text-label-md font-medium">Type to preview</span>
                        </div>
                      {/snippet}
                    </PreviewSurface>
                  {/if}
                {:else if uploadMode === 'image'}
                  {#if imagePreviewMode === 'live' && imageLiveFrames.length > 0}
                    <LiveTransformCanvas
                      frames={imageLiveFrames}
                      fps={1}
                      backdropColor={imageBackdropColor}
                      bind:scale={imageScale}
                      bind:panX={imagePanX}
                      bind:panY={imagePanY}
                    />
                  {:else if imagePreviewMode === 'preview' && previewUrl}
                    <PreviewSurface size={260} busy={isGeneratingPreview}>
                      <img src={previewUrl} alt="" width="368" height="368" decoding="async" />
                    </PreviewSurface>
                  {:else}
                    <PreviewSurface size={260} quiet empty busy={isGeneratingPreview}>
                      {#snippet empty_()}
                        <div class="flex flex-col items-center gap-1.5 text-on-surface-variant">
                          <span class="material-symbols-outlined text-[40px] opacity-70">add_photo_alternate</span>
                          <span class="text-label-md font-medium">Pick an image to preview</span>
                        </div>
                      {/snippet}
                    </PreviewSurface>
                  {/if}
                {:else if uploadMode === 'images'}
                  {#if sequencePreviewMode === 'live' && sequenceLiveFrames.length > 0}
                    <LiveTransformCanvas
                      frames={sequenceLiveFrames}
                      fps={sequenceFps}
                      bind:scale={sequenceScale}
                      bind:panX={sequencePanX}
                      bind:panY={sequencePanY}
                    />
                  {:else if aviPreviewFrames.length > 0}
                    <AviPlayer bind:this={aviPlayer} frames={aviPreviewFrames} fps={aviPreviewFps} label="Image sequence preview" />
                  {:else}
                    <PreviewSurface size={260} quiet empty busy={isGeneratingPreview}>
                      {#snippet empty_()}
                        <div class="flex flex-col items-center gap-1.5 text-on-surface-variant">
                          <span class="material-symbols-outlined text-[40px] opacity-70">burst_mode</span>
                          <span class="text-label-md font-medium">Choose images for sequence</span>
                        </div>
                      {/snippet}
                    </PreviewSurface>
                  {/if}
                {:else if uploadMode === 'video'}
                  {#if videoScrubFrame && isVideoScrubbing}
                    <LiveTransformCanvas
                      frames={[videoScrubFrame]}
                      fps={videoFps}
                      bind:scale={videoScale}
                      bind:panX={videoPanX}
                      bind:panY={videoPanY}
                    />
                  {:else if videoPreviewMode === 'live' && videoLiveFrames.length > 0}
                    <LiveTransformCanvas
                      frames={videoLiveFrames}
                      fps={videoFps}
                      bind:scale={videoScale}
                      bind:panX={videoPanX}
                      bind:panY={videoPanY}
                    />
                  {:else if aviPreviewFrames.length > 0}
                    <AviPlayer bind:this={aviPlayer} frames={aviPreviewFrames} fps={aviPreviewFps} label="Video preview" />
                  {:else}
                    <PreviewSurface size={260} quiet empty busy={isGeneratingPreview}>
                      {#snippet empty_()}
                        <div class="flex flex-col items-center gap-1.5 text-on-surface-variant">
                          <span class="material-symbols-outlined text-[40px] opacity-70">movie</span>
                          <span class="text-label-md font-medium">Pick a video to preview</span>
                        </div>
                      {/snippet}
                    </PreviewSurface>
                  {/if}
                {:else if uploadMode === 'gif'}
                  {#if aviPreviewFrames.length > 0}
                    <AviPlayer bind:this={aviPlayer} frames={aviPreviewFrames} fps={aviPreviewFps} label="GIF preview" />
                  {:else}
                    <PreviewSurface size={260} quiet empty busy={gifBusy}>
                      {#snippet empty_()}
                        <div class="flex flex-col items-center gap-1.5 text-on-surface-variant">
                          <span class="material-symbols-outlined text-[40px] opacity-70">gif_box</span>
                          <span class="text-label-md font-medium">Drop a GIF to preview</span>
                        </div>
                      {/snippet}
                    </PreviewSurface>
                  {/if}
                {:else if uploadMode === 'qr'}
                  {#if previewUrl}
                    <PreviewSurface size={260} busy={isGeneratingPreview}>
                      <img src={previewUrl} alt="QR code" width="368" height="368" decoding="async" />
                    </PreviewSurface>
                  {:else}
                    <PreviewSurface size={260} quiet empty busy={isGeneratingPreview}>
                      {#snippet empty_()}
                        <div class="flex flex-col items-center gap-1.5 text-on-surface-variant">
                          <span class="material-symbols-outlined text-[40px] opacity-70">qr_code_2</span>
                          <span class="text-label-md font-medium">Enter a URL to preview</span>
                        </div>
                      {/snippet}
                    </PreviewSurface>
                  {/if}
                {/if}

                {#if preparedPayloadLabel}
                  <p class="text-body-sm text-on-surface-variant text-center m-0">
                    Ready: <span class="text-on-surface font-medium">{preparedPayloadLabel}</span>
                    {#if preparedPayload && preparedPayload.length > MAX_UPLOAD_BYTES}
                      <span class="text-error block mt-1">⚠ {formatBytes(preparedPayload.length)} exceeds {formatBytes(MAX_UPLOAD_BYTES)} limit</span>
                    {/if}
                  </p>
                {/if}
                {#if uploadMode === 'pattern' && selectedPattern}
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 self-center text-label-sm text-primary hover:text-on-surface transition-colors"
                    onclick={copyShareUrl}
                    title="Copy shareable link"
                  >
                    <span class="material-symbols-outlined text-[16px]">link</span>
                    Share link
                  </button>
                {/if}
              </div>

              <!-- Send / Download primary actions -->
              <div class="flex flex-col gap-3 w-full">
                {#if !conn && !httpConn && !isWriting}
                  <M3Button
                    variant="tonal"
                    size="lg"
                    icon="bluetooth_searching"
                    onclick={connect}
                    class="w-full"
                  >
                    Connect badge to send
                  </M3Button>
                {:else}
                  <M3Button
                    variant="filled"
                    size="lg"
                    icon={isWriting ? 'autorenew' : 'send'}
                    disabled={isWriting}
                    onclick={startUpload}
                    class="w-full shadow-glow-primary"
                  >
                    {isWriting ? 'Sending…' : 'Send to Badge'}
                  </M3Button>
                {/if}
                {#if isWriting}
                  <M3Button variant="tonal" size="lg" icon="stop_circle" onclick={cancelWrite} class="w-full">Cancel</M3Button>
                {:else}
                  <M3Button variant="text" size="lg" icon="download" disabled={isWriting} onclick={downloadGenerated} class="w-full">Download AVI</M3Button>
                {/if}
              </div>

              <UploadProgress
                {isWriting}
                {progress}
                {progressLabel}
                {uploadStartTime}
                sentBytes={sentBytesForEta}
                totalBytes={totalBytesForEta}
              />
            </aside>

            <!-- ── Controls column ─────────────────────────────────────── -->
            <div class="auracast-mode-content order-2 lg:order-2 min-w-0 flex flex-col gap-4">
              {#if uploadMode === 'pattern'}
                <PatternMode
                  {isWriting}
                  {isGeneratingPreview}
                  {isGeneratingPattern}
                  {selectedPattern}
                  bind:patternFrameCount
                  bind:patternFps
                  bind:outputMode={patternOutputMode}
                  bind:animateThumbnails
                  initialPatternId={saved.selectedPatternId}
                  onSelectPattern={selectPattern}
                  onGeneratePreview={generatePreview}
                  onGenerateStill={generatePatternStill}
                />
              {:else if uploadMode === 'text'}
                {#if lazyModes.text}
                  {@const TextMode = lazyModes.text}
                  <TextMode
                    {isWriting}
                    {isGeneratingPreview}
                    {isGeneratingPattern}
                    bind:text
                    bind:textEffect
                    bind:textFontId
                    bind:textColor
                    bind:textBackground
                    bind:textFps
                    bind:textFrames
                    onGeneratePreview={generatePreview}
                    onGenerateStill={generateTextStill}
                  />
                {/if}
              {:else if uploadMode === 'image'}
                {#if lazyModes.image}
                  {@const ImageMode = lazyModes.image}
                  <ImageMode
                    {isWriting}
                    {selectedFile}
                    bind:backdropColor={imageBackdropColor}
                    onSelectFile={setFile}
                  />
                {/if}
                {#if imagePreviewMode === 'preview' && selectedFile}
                  <div class="flex gap-2">
                    <M3Button variant="tonal" size="sm" icon="auto_awesome" disabled={isWriting || isGeneratingPreview} onclick={generatePreview}>
                      {isGeneratingPreview ? 'Generating…' : 'Generate preview'}
                    </M3Button>
                  </div>
                {/if}
              {:else if uploadMode === 'images'}
                {#if lazyModes.images}
                  {@const SequenceMode = lazyModes.images}
                  <SequenceMode
                    {isWriting}
                    {selectedFiles}
                    bind:sequenceFps
                    onSelectFiles={setMultipleFiles}
                  />
                {/if}
                {#if sequencePreviewMode === 'preview'}
                  <div class="flex gap-2">
                    <M3Button variant="tonal" size="sm" icon="auto_awesome" disabled={isWriting || isGeneratingPreview || selectedFiles.length === 0} onclick={generatePreview}>
                      {isGeneratingPreview ? 'Generating…' : 'Generate preview'}
                    </M3Button>
                  </div>
                {/if}
              {:else if uploadMode === 'video'}
                {#if lazyModes.video}
                  {@const VideoMode = lazyModes.video}
                  <VideoMode
                    {isWriting}
                    {selectedFile}
                    bind:videoFps
                    bind:videoTrimStart
                    bind:videoTrimEnd
                    {videoDuration}
                    onSelectVideo={setVideoFile}
                    onScrubStart={onVideoScrubStart}
                    onScrubFrame={onVideoScrubFrame}
                    onScrubEnd={onVideoScrubEnd}
                  />
                {/if}
                {#if videoPreviewMode === 'preview'}
                  <div class="flex gap-2">
                    <M3Button variant="tonal" size="sm" icon="auto_awesome" disabled={isWriting || isGeneratingPreview || !selectedFile} onclick={generatePreview}>
                      {isGeneratingPreview ? 'Generating…' : 'Generate preview'}
                    </M3Button>
                  </div>
                {/if}
              {:else if uploadMode === 'gif'}
                {#if lazyModes.gif}
                  {@const GifMode = lazyModes.gif}
                  <GifMode
                    {isWriting}
                    bind:busy={gifBusy}
                    onResult={handleGifResult}
                  />
                {/if}
              {:else if uploadMode === 'qr'}
                {#if lazyModes.qr}
                  {@const QrMode = lazyModes.qr}
                  <QrMode
                    {isWriting}
                    bind:qrUrl
                    bind:qrDarkColor
                    bind:qrLightColor
                    bind:qrDotStyle
                    bind:qrOutsideMode
                    bind:qrZoom
                    bind:qrRotation
                  />
                {/if}
              {/if}

              {#if debugMode}
                <div class="flex gap-3 items-end border-t border-outline-variant pt-3">
                  <label class="flex flex-col gap-1 text-[12px]">
                    <span class="text-label-md text-on-surface-variant">Inter-chunk delay (ms)</span>
                    <input type="number" inputmode="numeric" autocomplete="off" min="0" max="1000" step="1" bind:value={interChunkDelayMs} disabled={isWriting} aria-label="Inter-chunk delay in milliseconds" class="tabular max-w-[8rem]" />
                  </label>
                </div>
              {/if}
            </div>
          </div>
          </M3Card>
        </div>

        <!-- ═══ M3 Help dialog ═══ -->
        <M3Dialog bind:open={helpOpen} headline="Help & troubleshooting">
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap gap-2">
              {#if !hasWebBluetooth}
                <M3Button variant="tonal" size="sm" icon="stethoscope" disabled={isRunningDiagnostics || isWriting} onclick={runDiagnostics}>
                  {isRunningDiagnostics ? 'Running…' : 'Run diagnostics'}
                </M3Button>
                <M3Button variant="tonal" size="sm" icon="autorenew" disabled={isWriting} onclick={bustCache}>Reset BLE cache</M3Button>
              {/if}
            </div>

            <details class="help-disclosure" open>
              <summary>
                <span class="material-symbols-outlined help-disclosure-icon">touch_app</span>
                <span class="help-disclosure-title">Wake the badge</span>
                <span class="material-symbols-outlined help-disclosure-chevron">chevron_right</span>
              </summary>
              <ol class="help-disclosure-list">
                <li>The badge auto-sleeps after a few minutes. Press the <b>side button</b> once. The screen lights up and BLE advertising starts.</li>
                <li>The status pill turns green within ~1 second.</li>
                <li>If you already clicked Send, the backend will detect the wake-up automatically.</li>
              </ol>
            </details>

            <details class="help-disclosure">
              <summary>
                <span class="material-symbols-outlined help-disclosure-icon">{hasWebBluetooth ? 'bluetooth_searching' : 'language'}</span>
                <span class="help-disclosure-title">Pairing</span>
                <span class="material-symbols-outlined help-disclosure-chevron">chevron_right</span>
              </summary>
              {#if hasWebBluetooth}
                <ol class="help-disclosure-list">
                  <li>Click <b>Connect</b>. Chrome lists nearby BLE devices. Pick <code class="bg-surface-container px-1 rounded">E87</code> or one starting with <code class="bg-surface-container px-1 rounded">L8</code>.</li>
                  <li>Chrome remembers the choice. Click Disconnect + Connect to re-pair.</li>
                  <li>If empty, the badge is asleep or out of range.</li>
                </ol>
              {:else}
                <ol class="help-disclosure-list">
                  <li>No browser pair dialog. The local FastAPI backend on <code class="bg-surface-container px-1 rounded">:8089</code> talks to the badge directly via macOS Bluetooth.</li>
                  <li>First time only: macOS may prompt "Terminal would like to use Bluetooth". Click <b>Allow</b>.</li>
                  <li>If dismissed: <b>System Settings → Privacy &amp; Security → Bluetooth</b>, enable Terminal, relaunch.</li>
                </ol>
              {/if}
            </details>

            <details class="help-disclosure">
              <summary>
                <span class="material-symbols-outlined help-disclosure-icon">bug_report</span>
                <span class="help-disclosure-title">Transfer issues</span>
                <span class="material-symbols-outlined help-disclosure-chevron">chevron_right</span>
              </summary>
              <ul class="help-disclosure-list help-disclosure-list--bulleted">
                <li><b>Stuck at "X% transferring …" for &gt;30s:</b> the badge dropped the link. Click Cancel, press the side button, then Send. Backend retries 3× automatically.</li>
                <li><b>"AVI exceeds limit":</b> reduce frame count or fps. Single-slot cap is ~900 KB.</li>
                <li><b>"Badge rejected the upload":</b> gallery is full. Clear via Zrun app (see banner above when this fires).</li>
              </ul>
            </details>

            <details class="help-disclosure">
              <summary>
                <span class="material-symbols-outlined help-disclosure-icon">restart_alt</span>
                <span class="help-disclosure-title">Hard reset (last resort)</span>
                <span class="material-symbols-outlined help-disclosure-chevron">chevron_right</span>
              </summary>
              <ol class="help-disclosure-list">
                <li>Hold the <b>side button for 5 seconds</b> until the screen turns off.</li>
                <li>Wait 3 s, press once to power back on.</li>
                <li>Click Disconnect, then Connect again.</li>
              </ol>
            </details>

            <div class="text-body-sm text-on-surface-variant border-t border-outline-variant pt-3">
              <div><b class="text-on-surface">Status:</b> {status}</div>
              {#if !hasWebBluetooth && backendState && backendState !== 'idle' && backendState !== 'error'}
                <div class="text-tertiary">Backend: {backendState}{backendDetail ? `, ${backendDetail}` : ''}</div>
              {/if}
              {#if diagnosticsResult}
                <div class={diagnosticsResult.verdict === 'healthy' ? 'text-primary' : 'text-tertiary'}>
                  Verdict: <b>{diagnosticsResult.verdict}</b>{diagnosticsResult.detail ? `, ${diagnosticsResult.detail}` : ''}
                </div>
              {/if}
            </div>
          </div>
        </M3Dialog>

        <!-- ═══ Log card (collapsed) ═══ -->
        <details class="bg-surface-container rounded-2xl border border-outline-variant overflow-hidden shadow-elev-1 activity-log-card">
          <summary class="px-5 py-4 cursor-pointer text-label-md uppercase tracking-wider text-on-surface flex items-center justify-between hover:bg-surface-container-high transition-colors">
            <span class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-[20px] text-primary">terminal</span>
              Activity log
            </span>
            <span class="text-label-sm font-mono text-on-surface-variant normal-case tracking-normal">{logs.length} {logs.length === 1 ? 'entry' : 'entries'}</span>
          </summary>
          <ul class="px-5 pb-4 max-h-64 overflow-y-auto text-body-sm font-mono text-on-surface-variant space-y-0.5 border-t border-outline-variant pt-3" aria-live="polite" aria-atomic="false" aria-label="Activity log entries">
            {#each logs as entry}
              <li>{entry}</li>
            {/each}
            {#if logs.length === 0}
              <li class="opacity-60 italic">No activity yet.</li>
            {/if}
          </ul>
        </details>

        <footer class="site-footer flex flex-col items-center gap-2 py-3 lg:py-2.5 text-center">
          <p class="m-0 flex items-center justify-center gap-2 text-label-md text-on-surface-variant">
            <span class="material-symbols-outlined text-[16px] text-primary leading-none">bolt</span>
            <span class="font-semibold tracking-tight footer-wordmark">AuraCast</span>
            <span aria-hidden="true">·</span>
            <span>296 × 128 pixels of attitude, strapped to your chest</span>
          </p>
          <p class="m-0 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-body-sm text-on-surface-variant">
            <span>Protocol cracked open by</span>
            <a
              href="https://github.com/jumpingmushroom/e87_badge"
              target="_blank"
              rel="noopener"
              class="footer-credit"
              aria-label="e87_badge by jumpingmushroom on GitHub"
            >
              <span class="material-symbols-outlined text-[14px] leading-none">memory</span>
              <span>@jumpingmushroom</span>
            </a>
            <span aria-hidden="true">·</span>
            <span>Web Bluetooth bones by</span>
            <a
              href="https://github.com/hybridherbst/web-bluetooth-e87"
              target="_blank"
              rel="noopener"
              class="footer-credit"
              aria-label="web-bluetooth-e87 by hybridherbst on GitHub"
            >
              <span class="material-symbols-outlined text-[14px] leading-none">bluetooth</span>
              <span>@hybridherbst</span>
            </a>
          </p>
          <p class="m-0 text-label-sm text-on-surface-variant/70 italic footer-tagline-extra">
            Built on their shoulders. Painted in M3. Shipped over MJPEG.
          </p>
        </footer>
      </div>
    </main>
  </div>

  <!-- ═══ M3 Navigation Bar (mobile bottom) ═══ -->
  <div class="lg:hidden fixed bottom-0 inset-x-0 z-40">
    <M3NavigationBar
      destinations={MODE_TABS.map(t => ({ value: t.id, label: t.mobileLabel ?? t.label, icon: t.icon }))}
      value={uploadMode}
      onchange={(v) => switchMode(v)}
    />
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #0b0d12;
    color: #e6eaf2;
    font-family: 'Manrope Variable', 'Manrope', ui-sans-serif, system-ui, sans-serif;
    min-height: 100vh;
  }
  :global(html) { background: #0b0d12; }

  /* ── Footer wordmark + credit chips ──────────────────────────────
     Aurora-gradient AuraCast wordmark and pill-shaped credit chips
     for the two upstream projects. */
  :global(.footer-wordmark) {
    background: linear-gradient(
      105deg,
      var(--md-sys-color-primary) 0%,
      var(--md-sys-color-tertiary) 55%,
      var(--md-sys-color-primary) 100%
    );
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: footer-wordmark-shimmer 9s linear infinite;
  }
  @keyframes footer-wordmark-shimmer {
    0%   { background-position: 0% 50%; }
    100% { background-position: 220% 50%; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.footer-wordmark) { animation: none; background-position: 0 50%; }
  }

  :global(.footer-credit) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    padding: 1px 9px 1px 7px;
    border-radius: 9999px;
    color: var(--md-sys-color-primary);
    background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--md-sys-color-primary) 22%, transparent);
    text-decoration: none;
    font-weight: 500;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }
  :global(.footer-credit:hover) {
    background: color-mix(in srgb, var(--md-sys-color-primary) 16%, transparent);
    border-color: color-mix(in srgb, var(--md-sys-color-primary) 40%, transparent);
    transform: translateY(-1px);
  }
  :global(.footer-credit:focus-visible) {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }
  /* ── Compact-height fit ───────────────────────────────────────────
     Common laptop displays (1366×768, 1280×800) have ≤820px of usable
     viewport once the OS chrome eats its share. The settings panels
     are the priority - everything else (intro text, log card, footer)
     gets compressed or hidden so the primary controls stay above the
     fold and the user doesn't have to scroll inside <main>. */
  @media (max-height: 860px) {
    :global(.page-intro) { display: none; }
    :global(.site-footer) { padding-top: 2px; padding-bottom: 2px; gap: 4px; font-size: 0.7rem; }
    :global(.site-footer a) { min-height: 22px; padding-top: 0; padding-bottom: 0; padding-left: 8px; padding-right: 8px; }
    :global(.site-footer .footer-tagline-extra) { display: none; }
    :global(main) { padding-top: 10px !important; padding-bottom: 8px !important; }
  }
  @media (max-height: 800px) {
    :global(.activity-log-card) { display: none; }
  }
  @media (max-height: 740px) {
    :global(.page-header h1) { font-size: 1.5rem; }
    :global(.site-footer) { display: none; }
  }


  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.96) translateY(6px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ── Help dialog disclosures ─────────────────────────────────── */
  .help-disclosure {
    border: 1px solid #262833;
    border-radius: 12px;
    background: rgba(22, 25, 34, 0.4);
    overflow: hidden;
    transition: background-color 160ms ease, border-color 160ms ease;
  }
  .help-disclosure:hover { border-color: #3a3d4a; }
  .help-disclosure[open] {
    background: rgba(22, 25, 34, 0.65);
    border-color: #3a3d4a;
  }
  .help-disclosure > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    font-weight: 600;
    color: #e6eaf2;
    font-size: 14px;
    line-height: 1.35;
    user-select: none;
  }
  .help-disclosure[open] > summary { padding-bottom: 10px; }
  .help-disclosure > summary::-webkit-details-marker { display: none; }
  .help-disclosure > summary::marker { content: ''; }
  .help-disclosure-icon {
    font-size: 20px !important;
    color: #7aa6ff;
    flex-shrink: 0;
    line-height: 1;
  }
  .help-disclosure-title {
    flex: 1 1 auto;
    min-width: 0;
    line-height: 1.3;
  }
  .help-disclosure-chevron {
    font-size: 20px !important;
    color: #a4abbd;
    flex-shrink: 0;
    transition: transform 180ms ease;
    line-height: 1;
  }
  .help-disclosure[open] > summary > .help-disclosure-chevron {
    transform: rotate(90deg);
  }
  .help-disclosure-list {
    margin: 0;
    padding: 2px 18px 16px 48px;
    list-style: decimal;
    color: #a4abbd;
    font-size: 13px;
    line-height: 1.6;
  }
  .help-disclosure-list--bulleted { list-style: disc; padding-left: 44px; }
  .help-disclosure-list > li { padding-left: 4px; }
  .help-disclosure-list > li + li { margin-top: 10px; }
  .help-disclosure-list b { color: #e6eaf2; font-weight: 600; }
  .help-disclosure-list code { font-size: 0.92em; }
</style>
