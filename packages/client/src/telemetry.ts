import * as Sentry from '@sentry/browser'

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.1,
    release: import.meta.env.VITE_APP_VERSION ?? 'dev',
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capture(message: string, extra?: Record<string, unknown>): void {
  Sentry.captureEvent({ message, level: 'info', extra })
  Sentry.addBreadcrumb({ category: 'analytics', message, data: extra })
}

// ── Scene visits ──────────────────────────────────────────────────────────────

const sceneEnterTime = new Map<string, number>()

export function trackSceneEnter(scene: string): void {
  sceneEnterTime.set(scene, Date.now())
  capture('scene_enter', { scene })
}

export function trackSceneLeave(scene: string): void {
  const enter = sceneEnterTime.get(scene)
  if (!enter) return
  const durationSec = Math.round((Date.now() - enter) / 1000)
  capture('scene_leave', { scene, durationSec })
  sceneEnterTime.delete(scene)
}

// ── Game session ──────────────────────────────────────────────────────────────

let sessionStart = 0

export function trackGameStart(playerCount: number, botCount: number): void {
  sessionStart = Date.now()
  capture('game_started', { playerCount, botCount })
}

export function trackGameEnd(myScore: number, place: number, totalPlayers: number): void {
  const durationSec = Math.round((Date.now() - sessionStart) / 1000)
  capture('game_ended', { myScore, place, totalPlayers, durationSec })
}

// ── Room events ───────────────────────────────────────────────────────────────

export function trackRoomCreated(): void {
  capture('room_created')
}

export function trackRoomJoined(): void {
  capture('room_joined')
}

// ── Delivery ──────────────────────────────────────────────────────────────────

export function trackDelivery(score: number, bonusScore: number): void {
  capture('delivery_completed', { score, bonusScore, total: score + bonusScore })
}
