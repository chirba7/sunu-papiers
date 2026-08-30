import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api.js'

/**
 * Source unique des demandes du délégué.
 *
 * Le front ne recalcule jamais les compteurs en rechargeant la liste complète :
 * il sonde toutes les 20 s la route légère `/delegate/requests/summary`
 * (une seule requête, deux colonnes, cache serveur de 30 s) et ne recharge la
 * liste détaillée que si la signature renvoyée a changé. La liste reste donc en
 * cache entre les pages : naviguer ne déclenche aucun appel réseau.
 */

const POLL_MS = 20000
const MAX_AGE_MS = 5 * 60 * 1000

let state = { requests: [], summary: null, loading: true, error: '', loadedAt: 0 }

const listeners = new Set()
let timer = null
let subscribers = 0
let inFlight = null
let lastPending = null

const emit = () => { for (const listener of listeners) listener() }
const set = (patch) => { state = { ...state, ...patch }; emit() }

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getSnapshot = () => state

/* ---------------------------------------------------------------- bip sonore */

let audioContext = null

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audioContext = audioContext || new Ctx()
    if (audioContext.state === 'suspended') audioContext.resume()
    const start = audioContext.currentTime
    const note = (delay, frequency) => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + delay)
      gain.gain.exponentialRampToValueAtTime(0.22, start + delay + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.3)
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(start + delay)
      oscillator.stop(start + delay + 0.32)
    }
    note(0, 880)
    note(0.19, 1174.7)
  } catch { /* le navigateur peut refuser le son sans interaction préalable */ }
}

/** Débloque le son au premier clic (politique d'autoplay des navigateurs). */
export function unlockSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audioContext = audioContext || new Ctx()
    if (audioContext.state === 'suspended') audioContext.resume()
  } catch { /* ignoré */ }
}

function notify(count) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    new Notification('Sunu Papier · Nouvelle demande', {
      body: count > 1 ? `${count} nouvelles demandes sont à traiter.` : 'Une nouvelle demande est à traiter.',
      icon: '/favicon.svg',
      tag: 'sunu-nouvelle-demande',
    })
  } catch { /* ignoré */ }
}

export function askNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  } catch { /* ignoré */ }
}

/* ------------------------------------------------------------------ sondage */

async function tick(force = false) {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const summary = await api(`/delegate/requests/summary${force ? '?refresh=1' : ''}`)
      const changed = state.summary?.signature !== summary.signature
      const expired = Date.now() - state.loadedAt > MAX_AGE_MS
      if (changed || expired || force || !state.loadedAt) {
        const requests = await api('/delegate/requests')
        set({ requests, summary, loading: false, error: '', loadedAt: Date.now() })
      } else {
        set({ summary, loading: false, error: '' })
      }
      if (lastPending !== null && summary.pending > lastPending) {
        beep()
        notify(summary.pending - lastPending)
      }
      lastPending = summary.pending
    } catch (error) {
      set({ loading: false, error: error.message })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Force un rechargement immédiat (après approbation ou refus). */
export const refresh = () => tick(true)

export function reset() {
  state = { requests: [], summary: null, loading: true, error: '', loadedAt: 0 }
  lastPending = null
  emit()
}

const onVisibilityChange = () => { if (document.visibilityState === 'visible') tick(false) }

function start() {
  subscribers += 1
  if (subscribers === 1) {
    tick(!state.loadedAt)
    timer = setInterval(() => tick(false), POLL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  return () => {
    subscribers -= 1
    if (subscribers === 0) {
      clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}

/** Abonne un composant au cache partagé et démarre le sondage si besoin. */
export function useRequests() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => start(), [])
  return snapshot
}

/* ------------------------------------------------------------------ statuts */

export const STATUS_META = {
  pending: { label: 'À traiter', tone: 'warn' },
  processing: { label: 'En cours de traitement', tone: 'warn' },
  approved: { label: 'Approuvée', tone: 'ok' },
  rejected: { label: 'Désapprouvée', tone: 'bad' },
}

export const statusMeta = (status) => STATUS_META[status] || { label: status || 'Inconnu', tone: 'neutral' }

export const isPending = (request) => request.status === 'pending' || request.status === 'processing'

/** À traiter en premier (plus récentes en tête), demandes traitées ensuite. */
export function sortRequests(requests) {
  return [...requests].sort((a, b) => {
    const openA = isPending(a) ? 0 : 1
    const openB = isPending(b) ? 0 : 1
    if (openA !== openB) return openA - openB
    const dateA = a.processed_at || a.submitted_at || ''
    const dateB = b.processed_at || b.submitted_at || ''
    return String(dateB).localeCompare(String(dateA))
  })
}
