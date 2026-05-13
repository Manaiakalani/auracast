<script lang="ts">
  /**
   * AuraCast brandmark v8 - on-brand interactive aurora orb.
   *
   * Uses the brand palette from DESIGN.md: cyan #00f2ff primary,
   * violet #bc00ff tertiary, deep navy #0a0b1e. The noise-driven
   * shader blends only these brand hues for a cohesive look that
   * matches the badge's neon ring aesthetic.
   *
   * Interactive: click/drag to rotate the orb freely. Release to
   * spring back to gentle auto-rotation with M3 emphasized easing.
   *
   * History:
   *   v1-v5: SVG iterations
   *   v6: Three.js static-band sphere
   *   v7: Noise-driven 5-color aurora orb
   *   v8: On-brand cyan/violet + drag-to-rotate (current)
   */
  import { onMount, onDestroy } from 'svelte'
  import {
    WebGLRenderer, Scene, PerspectiveCamera, SphereGeometry,
    ShaderMaterial, Mesh, Clock, Color, Euler, Quaternion,
  } from 'three'

  interface Props {
    size?: number
    class?: string
  }
  let { size = 40, class: klass = '' }: Props = $props()

  let container: HTMLDivElement
  let renderer: WebGLRenderer | null = null
  let animFrameId: number = 0

  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  /* ── GLSL noise (Ashima simplex3D, MIT) ──────────────────── */
  const noiseGLSL = /* glsl */ `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }
  `

  const vertexShader = /* glsl */ `
    ${noiseGLSL}
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying float vDisplacement;

    void main() {
      float slow = uTime * 0.4;
      float n1 = snoise(position * 1.8 + slow);
      float n2 = snoise(position * 3.6 + slow * 1.3) * 0.5;
      float disp = (n1 + n2) * 0.05;
      vDisplacement = disp;

      vec3 newPos = position + normal * disp;
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      vWorldPosition = (modelMatrix * vec4(newPos, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
  `

  /* Brand palette: cyan primary, violet tertiary, navy neutral.
     The shader blends between these three anchors via noise so the
     orb always reads as "AuraCast" regardless of the rotation angle. */
  const fragmentShader = /* glsl */ `
    ${noiseGLSL}
    uniform float uTime;
    uniform vec3 uCyan;
    uniform vec3 uViolet;
    uniform vec3 uNavy;
    uniform vec3 uCameraPos;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vWorldPosition;
    varying float vDisplacement;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCameraPos - vWorldPosition);

      // Multi-octave noise for flowing patterns
      float slow = uTime * 0.25;
      float n1 = snoise(vPosition * 2.2 + vec3(slow, slow * 0.6, slow * 0.35));
      float n2 = snoise(vPosition * 4.5 + vec3(-slow * 0.4, slow * 1.0, 0.0)) * 0.35;
      float n3 = snoise(vPosition * 9.0 + vec3(slow * 0.2, -slow * 0.5, slow * 0.8)) * 0.12;
      float noise = (n1 + n2 + n3) * 0.5 + 0.5;

      // Blend brand colors through noise
      // Low noise = deep violet/navy, mid = cyan, high = bright cyan-white
      vec3 deep = mix(uNavy, uViolet, smoothstep(0.0, 0.35, noise));
      vec3 bright = mix(uCyan, uCyan * 1.4 + 0.15, smoothstep(0.65, 1.0, noise));
      vec3 aurora = mix(deep, bright, smoothstep(0.25, 0.7, noise));

      // Fresnel rim: cyan edge glow like the badge's neon ring
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.8);
      vec3 rimColor = mix(uCyan, uViolet, fresnel * 0.5);

      // Specular highlight
      vec3 lightDir = normalize(vec3(0.8, 1.2, 2.0));
      vec3 halfDir = normalize(lightDir + V);
      float spec = pow(max(dot(N, halfDir), 0.0), 56.0);

      // Diffuse depth
      float diffuse = max(dot(N, lightDir), 0.0) * 0.3 + 0.7;

      // Core glow from displacement peaks
      float core = smoothstep(-0.01, 0.05, vDisplacement) * 0.25;

      vec3 color = aurora * diffuse;
      color += rimColor * fresnel * 0.8;
      color += vec3(0.85, 0.95, 1.0) * spec * 0.45;
      color += uCyan * core * 0.5;

      // Soft HDR bloom
      color += color * color * 0.12;

      gl_FragColor = vec4(color, 1.0);
    }
  `

  onMount(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const scene = new Scene()
    const cam = new PerspectiveCamera(28, 1, 0.1, 100)
    cam.position.set(0, 0, 4.5)

    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      })
    } catch {
      return
    }
    renderer.setSize(size, size)
    renderer.setPixelRatio(dpr)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const geo = new SphereGeometry(1, 64, 64)
    const mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uCyan:   { value: new Color(0x00f2ff) },
        uViolet: { value: new Color(0xbc00ff) },
        uNavy:   { value: new Color(0x0a0b1e) },
        uCameraPos: { value: cam.position.clone() },
      },
    })
    const sphere = new Mesh(geo, mat)
    scene.add(sphere)

    const clock = new Clock()

    /* ── Drag-to-rotate interaction ────────────────────────── */
    let isDragging = false
    let dragStartX = 0
    let dragStartY = 0
    // Accumulated rotation from completed drags
    let baseRotX = 0
    let baseRotY = 0
    // Live drag delta (applied on top of base during drag)
    let dragDeltaX = 0
    let dragDeltaY = 0
    // Spring-back: how much manual rotation remains (decays toward 0)
    let manualRotX = 0
    let manualRotY = 0
    // Sensitivity: radians per pixel of drag
    const DRAG_SENSITIVITY = 0.008
    // Spring decay per frame (M3-inspired emphasized decel feel)
    const SPRING_DECAY = 0.92

    function onPointerDown(e: PointerEvent) {
      isDragging = true
      dragStartX = e.clientX
      dragStartY = e.clientY
      dragDeltaX = 0
      dragDeltaY = 0
      container.setPointerCapture(e.pointerId)
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDragging) return
      dragDeltaX = (e.clientX - dragStartX) * DRAG_SENSITIVITY
      dragDeltaY = (e.clientY - dragStartY) * DRAG_SENSITIVITY
    }

    function onPointerUp(e: PointerEvent) {
      if (!isDragging) return
      isDragging = false
      // Commit drag deltas into manual rotation for spring-back
      manualRotX += dragDeltaX
      manualRotY += dragDeltaY
      baseRotX += dragDeltaX
      baseRotY += dragDeltaY
      dragDeltaX = 0
      dragDeltaY = 0
      container.releasePointerCapture(e.pointerId)
    }

    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerUp)

    function animate() {
      animFrameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      mat.uniforms.uTime.value = t

      // Spring-back: decay manual rotation toward zero
      if (!isDragging && (Math.abs(manualRotX) > 0.001 || Math.abs(manualRotY) > 0.001)) {
        manualRotX *= SPRING_DECAY
        manualRotY *= SPRING_DECAY
        baseRotX = manualRotX
        baseRotY = manualRotY
      } else if (!isDragging) {
        manualRotX = 0
        manualRotY = 0
        baseRotX = 0
        baseRotY = 0
      }

      if (!prefersReducedMotion) {
        // Auto-rotation (slow Y-axis spin)
        const autoY = t * (Math.PI * 2) / 25

        if (isDragging) {
          sphere.rotation.x = dragDeltaY
          sphere.rotation.y = autoY + dragDeltaX
        } else {
          sphere.rotation.x = baseRotY
          sphere.rotation.y = autoY + baseRotX
        }
      }

      renderer!.render(scene, cam)
    }
    animate()

    // Store cleanup ref
    const cleanupPointer = () => {
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
    }
    ;(container as any).__cleanupPointer = cleanupPointer
  })

  onDestroy(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    if (container && (container as any).__cleanupPointer) {
      ;(container as any).__cleanupPointer()
    }
    if (renderer) {
      renderer.dispose()
      renderer.forceContextLoss()
      renderer = null
    }
  })
</script>

<div
  bind:this={container}
  class="auracast-mark-3d {klass}"
  style="width: {size}px; height: {size}px; cursor: grab;"
  role="img"
  aria-label="AuraCast"
></div>

<style>
  .auracast-mark-3d {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    filter: drop-shadow(0 0 8px rgba(0, 242, 255, 0.4))
            drop-shadow(0 0 24px rgba(188, 0, 255, 0.25));
  }

  .auracast-mark-3d:active {
    cursor: grabbing;
  }

  .auracast-mark-3d :global(canvas) {
    display: block;
    border-radius: 50%;
  }
</style>
