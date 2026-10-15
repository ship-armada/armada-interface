// ABOUTME: Short brand-colored confetti burst when an ARM allocation is found.
// ABOUTME: One canvas, one animation frame loop, removed when the burst ends or the result leaves.

const BURST_MS = 1800
const COLOR_VARS = [
  '--semantic-color-brand-lavender',
  '--semantic-color-brand-gradient-rose',
  '--semantic-color-brand-amber',
  '--semantic-component-button-primary-text',
] as const

type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  spin: number
  color: string
  delay: number
}

function brandColors(): string[] {
  const style = getComputedStyle(document.documentElement)
  return COLOR_VARS.map((name) => style.getPropertyValue(name).trim()).filter((color) => color.length > 0)
}

export function burstAllocationConfetti(origin: HTMLElement, className: string): () => void {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => undefined
  }

  const colors = brandColors()
  const firstColor = colors[0]
  if (!firstColor) return () => undefined

  const canvas = document.createElement('canvas')
  canvas.className = className
  canvas.setAttribute('aria-hidden', 'true')
  const context = canvas.getContext('2d')
  if (!context) return () => undefined
  const draw: CanvasRenderingContext2D = context

  document.body.appendChild(canvas)

  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const rect = origin.getBoundingClientRect()
  const ox = rect.left + rect.width / 2
  const oy = rect.top + rect.height / 2
  const count = Math.round(Math.min(64, Math.max(36, window.innerWidth / 14)))
  const pieces: Piece[] = Array.from({ length: count }, (_, index) => {
    const angle = Math.random() * Math.PI * 2
    const speed = 1.6 + Math.random() * 3.4
    const color = colors[index % colors.length] ?? firstColor
    return {
      x: ox + (Math.random() - 0.5) * 48,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 4,
      h: 8 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.28,
      color,
      delay: Math.random() * 90,
    }
  })

  let frame = 0
  let last = performance.now()
  const started = last

  function resize() {
    canvas.width = Math.round(window.innerWidth * ratio)
    canvas.height = Math.round(window.innerHeight * ratio)
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
    draw.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  resize()

  function tick(now: number) {
    const elapsed = now - started
    const dt = Math.min(32, now - last) / 16.67
    last = now
    draw.clearRect(0, 0, window.innerWidth, window.innerHeight)

    for (const piece of pieces) {
      if (elapsed < piece.delay) continue
      piece.vy += 0.08 * dt
      piece.vx *= Math.pow(0.99, dt)
      piece.x += piece.vx * dt
      piece.y += piece.vy * dt
      piece.rot += piece.spin * dt
      const life = Math.min(1, (elapsed - piece.delay) / BURST_MS)
      const fade = life < 0.62 ? 1 : 1 - (life - 0.62) / 0.38
      draw.save()
      draw.translate(piece.x, piece.y)
      draw.rotate(piece.rot)
      draw.globalAlpha = Math.max(0, fade)
      draw.fillStyle = piece.color
      draw.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h)
      draw.restore()
    }

    if (elapsed < BURST_MS + 120) {
      frame = window.requestAnimationFrame(tick)
      return
    }
    stop()
  }

  function stop() {
    window.cancelAnimationFrame(frame)
    canvas.remove()
  }

  frame = window.requestAnimationFrame(tick)
  return stop
}
