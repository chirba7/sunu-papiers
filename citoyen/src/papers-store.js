import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api.js'

/**
 * Cache des papiers du citoyen.
 *
 * « Mes papiers » ne recharge jamais ce qui est déjà connu : la liste est
 * conservée en mémoire ET dans sessionStorage. À l'ouverture de la page, le
 * contenu en cache s'affiche immédiatement, puis une actualisation discrète
 * (stale-while-revalidate) se déclenche en arrière-plan, et seulement si le
 * cache a plus de FRESH_MS. La liste n'est donc pas retéléchargée à chaque
 * aller-retour entre les onglets.
 */

const STORAGE_KEY = 'sunu_citizen_papers'
const FRESH_MS = 60 * 1000

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.papers)) return null
    return parsed
  } catch {
    return null
  }
}

const stored = typeof sessionStorage !== 'undefined' ? readStorage() : null

let state = {
  papers: stored?.papers || [],
  loadedAt: stored?.loadedAt || 0,
  loading: !stored,
  refreshing: false,
  error: '',
}

const listeners = new Set()
let inFlight = null

const emit = () => { for (const listener of listeners) listener() }

function set(patch) {
  state = { ...state, ...patch }
  if (patch.papers) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ papers: state.papers, loadedAt: state.loadedAt }))
    } catch { /* quota ou navigation privée : le cache mémoire suffit */ }
  }
  emit()
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
const getSnapshot = () => state

async function load(force = false) {
  if (inFlight) return inFlight
  const fresh = Date.now() - state.loadedAt < FRESH_MS
  if (!force && fresh && state.papers.length) return null
  inFlight = (async () => {
    set(state.papers.length ? { refreshing: true, error: '' } : { loading: true, error: '' })
    try {
      const papers = await api('/requests/mine')
      set({ papers, loadedAt: Date.now(), loading: false, refreshing: false, error: '' })
    } catch (error) {
      set({ loading: false, refreshing: false, error: error.message })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export const refreshPapers = () => load(true)

export function resetPapers() {
  state = { papers: [], loadedAt: 0, loading: true, refreshing: false, error: '' }
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignoré */ }
  emit()
}

/** Insère localement une demande tout juste créée, sans rappeler le serveur. */
export function addPaper(paper) {
  set({ papers: [paper, ...state.papers], loadedAt: Date.now() })
}

export function usePapers() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => { load(false) }, [])
  return snapshot
}

/* ------------------------------------------------------------------ statuts */

export const PAPER_STATUS = {
  pending: {
    label: 'En attente',
    tone: 'wait',
    help: 'Votre demande a bien été transmise au délégué de votre quartier.',
  },
  processing: {
    label: 'En cours de traitement',
    tone: 'wait',
    help: 'Le délégué examine actuellement votre dossier.',
  },
  approved: {
    label: 'Approuvée',
    tone: 'ok',
    help: 'Votre certificat est prêt : vous pouvez le télécharger.',
  },
  rejected: {
    label: 'Désapprouvée',
    tone: 'bad',
    help: 'Le délégué a refusé la demande. Corrigez les points indiqués puis refaites une demande.',
  },
}

export const paperStatus = (status) =>
  PAPER_STATUS[status] || { label: status || 'Inconnu', tone: 'neutral', help: '' }

export const DOCUMENT_TYPES = [
  { value: 'domicile', label: 'Certificat de domicile', available: true, match: /domicile/i },
  { value: 'residence', label: 'Certificat de résidence', available: false, match: /r[ée]sidence/i },
]
