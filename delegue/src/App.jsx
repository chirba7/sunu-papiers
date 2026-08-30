import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Ban, CheckCircle2, ChevronRight, ClipboardCheck, Eye, EyeOff,
  FileCheck2, FileText, Home, IdCard, LockKeyhole, LogOut, Mail, MapPin, Menu, SearchCheck,
  Send, ShieldCheck, Sparkles, UserRound, Users, X, XCircle
} from 'lucide-react'
import { api, isLoggedIn, login, logout as apiLogout, uploadUrl } from './api.js'
import {
  askNotificationPermission, isPending, refresh, reset, sortRequests, statusMeta, unlockSound,
  useRequests
} from './requests-store.js'

const DELEGATE = { firstName: '', lastName: '', email: '', quartier: 'Non affecté' }

const REJECT_REASONS = [
  {
    code: 'incoherence',
    label: 'Incohérence des informations',
    hint: 'Les données saisies ne correspondent pas à la carte d’identité.',
    template:
      'Les informations de votre demande ne correspondent pas à celles de votre carte nationale d’identité. Merci de les corriger dans « Mon compte », puis de refaire votre demande.',
  },
  {
    code: 'mauvaise_maison',
    label: 'Mauvaise administration de quartier',
    hint: 'Le citoyen ne relève pas de cette maison de quartier.',
    template:
      'Vous n’êtes pas rattaché(e) à cette maison de quartier. Merci de refaire votre demande en sélectionnant l’administration de votre quartier de résidence.',
  },
  {
    code: 'documents_illisibles',
    label: 'Pièce d’identité illisible',
    hint: 'Les photos de la CNI sont floues, coupées ou incomplètes.',
    template:
      'Les photos de votre carte nationale d’identité sont illisibles ou incomplètes. Merci de les remplacer dans « Mon compte », puis de refaire votre demande.',
  },
  { code: 'autre', label: 'Autre motif', hint: 'Rédigez librement votre message.', template: '' },
]

const dateFR = (value) =>
  value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : ''

const dateTimeFR = (value) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    : ''

function Logo() {
  return <div className="app-logo"><span><FileCheck2 size={20} /></span><strong>Sunu Papier</strong></div>
}

function StatusPill({ status }) {
  const meta = statusMeta(status)
  const Icon = meta.tone === 'ok' ? CheckCircle2 : meta.tone === 'bad' ? XCircle : AlertTriangle
  return <span className={`status-pill tone-${meta.tone}`}><Icon size={15} />{meta.label}</span>
}

function Field({ label, icon: Icon, error, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className={`input-wrap ${error ? 'has-error' : ''}`}><Icon size={18} />{children}</div>
      {error && <small>{error}</small>}
    </div>
  )
}

function Toast({ message, tone = 'ok', onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, 4200)
    return () => clearTimeout(id)
  }, [onClose])
  return (
    <div className={`toast tone-${tone}`} role="status">
      {tone === 'bad' ? <XCircle size={19} /> : <CheckCircle2 size={19} />}
      <div><strong>{tone === 'bad' ? 'Action impossible' : 'Action effectuée'}</strong><span>{message}</span></div>
    </div>
  )
}

/* ------------------------------------------------------------------ connexion */

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [forgot, setForgot] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'E-mail invalide.'
    if (password.length < 6) next.password = '6 caractères minimum.'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      await login(email, password)
      reset()
      unlockSound()
      askNotificationPermission()
      navigate('/dashboard')
    } catch (error) {
      setErrors({ password: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-top"><Logo /><span>Délégué du quartier</span></div>
        <div className="auth-copy">
          <div className="eyebrow"><Sparkles size={15} /> Service de proximité</div>
          <h1>Traitez les demandes de votre quartier avec simplicité.</h1>
          <p>Consultez les informations des citoyens, vérifiez leur dossier puis complétez et envoyez leur certificat de domicile.</p>
          <div className="auth-pills">
            <span><ShieldCheck size={15} /> Accès sécurisé</span>
            <span><SearchCheck size={15} /> Quartier vérifié</span>
            <span><Send size={15} /> Envoi direct</span>
          </div>
        </div>
      </aside>
      <main className="auth-form">
        <form className="login-card" onSubmit={submit}>
          <Logo />
          <p className="kicker">Accès délégué</p>
          <h2>Connexion</h2>
          <p className="subtitle">Utilisez le compte créé par l’administrateur.</p>
          <Field label="Adresse e-mail" icon={Mail} error={errors.email}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@sunupapier.sn" />
          </Field>
          <Field label="Mot de passe" icon={LockKeyhole} error={errors.password}>
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Votre mot de passe" />
            <button className="icon-button" type="button" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </Field>
          <button type="button" className="forgot-link" onClick={() => setForgot(true)}>Mot de passe oublié ?</button>
          <button className="primary-button" disabled={loading}>{loading ? <span className="loader" /> : <>Se connecter <ArrowRight size={18} /></>}</button>
        </form>
      </main>
      {forgot && (
        <div className="modal-backdrop">
          <div className="modal">
            <button className="modal-x" onClick={() => setForgot(false)}><X size={18} /></button>
            <h3>Mot de passe oublié</h3>
            <p>Contactez l’administrateur pour réinitialiser votre accès.</p>
            <button className="primary-button" onClick={() => setForgot(false)}>Compris</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- shell */

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: Home },
  { path: '/demandes', label: 'Demandes reçues', icon: ClipboardCheck, badge: true },
  { path: '/profil', label: 'Mes informations', icon: UserRound },
]

function Shell({ children }) {
  const loc = useLocation()
  const navg = useNavigate()
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState(DELEGATE)
  const { summary } = useRequests()
  const pending = summary?.pending || 0

  useEffect(() => {
    api('/me').then((d) => setMe({ ...d, quartier: d.house?.quartier || 'Non affecté' })).catch(() => {})
  }, [])

  useEffect(() => {
    document.title = pending > 0 ? `(${pending}) Sunu Papier · Délégué` : 'Sunu Papier · Délégué'
  }, [pending])

  const logout = () => { apiLogout(); reset(); navg('/connexion') }
  const initials = `${me.firstName?.[0] || ''}${me.lastName?.[0] || ''}`

  return (
    <div className="workspace" onPointerDown={unlockSound}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="side-head"><Logo /><button onClick={() => setOpen(false)} className="mobile-close"><X size={20} /></button></div>
        <div className="delegate-mini"><div>{initials}</div><span><strong>{me.firstName} {me.lastName}</strong><small>{me.quartier}</small></span></div>
        <nav>
          {NAV.map(({ path, label, icon: Icon, badge }) => (
            <button key={path} className={loc.pathname === path ? 'active' : ''} onClick={() => { navg(path); setOpen(false) }}>
              <Icon size={19} />
              <span>{label}</span>
              {badge && pending > 0
                ? <span className="nav-badge" title={`${pending} demande(s) à traiter`}>{pending}</span>
                : <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <button className="logout" onClick={logout}><LogOut size={18} />Déconnexion</button>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen(true)}>
            <Menu size={21} />
            {pending > 0 && <span className="menu-dot" />}
          </button>
          <div><strong>Espace délégué</strong><span>{me.quartier}</span></div>
          <div className="topbar-right">
            {pending > 0 && (
              <button className="pending-chip" onClick={() => navg('/demandes')}>
                <ClipboardCheck size={16} />{pending} à traiter
              </button>
            )}
            <div className="avatar">{initials}</div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      {open && <button className="overlay" onClick={() => setOpen(false)} />}
    </div>
  )
}

function Header({ eyebrow, title, description }) {
  return <div className="page-header"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
}

/* ----------------------------------------------------------- liste demandes */

function RequestList({ limit }) {
  const navg = useNavigate()
  const { requests, loading, error } = useRequests()
  const sorted = useMemo(() => sortRequests(requests), [requests])
  const shown = limit ? sorted.slice(0, limit) : sorted
  const openCount = sorted.filter(isPending).length

  if (loading && requests.length === 0) return <p className="list-state">Chargement des demandes…</p>
  if (error && requests.length === 0) return <p className="list-state error">{error}</p>
  if (sorted.length === 0) return <p className="list-state">Aucune demande attribuée pour le moment.</p>

  return (
    <div className="requests">
      {shown.map((r, index) => {
        const open = isPending(r)
        const meta = statusMeta(r.status)
        const firstDone = !open && index > 0 && isPending(shown[index - 1])
        return (
          <div key={r.id} className="request-row">
            {firstDone && openCount > 0 && <div className="list-separator"><span>Demandes déjà traitées</span></div>}
            <button className={`request-card ${open ? 'is-open' : 'is-done'}`} onClick={() => navg(`/demandes/${r.id}`)}>
              <span className={`doc-icon tone-${meta.tone}`}><FileText size={19} /></span>
              <div className="request-main">
                <strong>{r.firstName} {r.lastName}</strong>
                <span>{r.reference} · déposée le {dateTimeFR(r.submitted_at)}</span>
                {r.status === 'rejected' && r.rejection_reason && <em className="request-reason">Motif : {r.rejection_reason}</em>}
              </div>
              <StatusPill status={r.status} />
              <ChevronRight size={18} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Dashboard() {
  const [me, setMe] = useState(DELEGATE)
  const { summary, requests } = useRequests()
  useEffect(() => {
    api('/me').then((m) => setMe({ ...m, quartier: m.house?.quartier || 'Non affecté' })).catch(() => {})
  }, [])
  const stats = summary || {
    pending: requests.filter(isPending).length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    total: requests.length,
  }
  return (
    <Shell>
      <Header eyebrow="Vue d’ensemble" title={`Bonjour ${me.firstName || ''}`} description="Voici les demandes de certificat de domicile attribuées à votre quartier." />
      <div className="match-rule">
        <SearchCheck size={22} />
        <div><strong>Filtrage automatique actif</strong><span>Vous recevez uniquement les demandes affectées à <b>{me.quartier}</b>.</span></div>
      </div>
      <section className="stats">
        <article className={stats.pending > 0 ? 'highlight' : ''}><div><ClipboardCheck size={21} /></div><span>Demandes à traiter</span><strong>{stats.pending}</strong></article>
        <article><div><FileCheck2 size={21} /></div><span>Certificats envoyés</span><strong>{stats.approved}</strong></article>
        <article><div><Ban size={21} /></div><span>Demandes désapprouvées</span><strong>{stats.rejected}</strong></article>
        <article><div><Users size={21} /></div><span>Demandes totales</span><strong>{stats.total}</strong></article>
      </section>
      <article className="panel">
        <div className="panel-head"><div><span>Récentes</span><h3>Demandes reçues</h3></div></div>
        <RequestList limit={6} />
      </article>
    </Shell>
  )
}

function Demandes() {
  const { summary } = useRequests()
  return (
    <Shell>
      <Header
        eyebrow="Traitement"
        title="Demandes reçues"
        description="Demandes de citoyens rattachées automatiquement à votre quartier. Les demandes à traiter apparaissent en premier."
      />
      {summary?.pending > 0 && (
        <div className="match-rule warn">
          <AlertTriangle size={22} />
          <div><strong>{summary.pending} demande{summary.pending > 1 ? 's' : ''} en attente</strong><span>La liste se met à jour automatiquement, sans rafraîchir la page.</span></div>
        </div>
      )}
      <article className="panel"><RequestList /></article>
    </Shell>
  )
}

/* ------------------------------------------------------- écran de traitement */

function IdentityPreview({ side, src }) {
  if (!src)
    return (
      <div className="id-preview">
        <div className="id-watermark"><IdCard size={34} /></div>
        <span>Carte d’identité — {side}</span>
        <small>Photo non renseignée par le citoyen</small>
      </div>
    )
  return (
    <div className="id-preview has-photo">
      <a href={uploadUrl(src)} target="_blank" rel="noreferrer">
        <img src={uploadUrl(src)} alt={`Carte d’identité — ${side}`} />
        <span>Ouvrir en grand</span>
      </a>
    </div>
  )
}

function RejectModal({ request, onClose, onDone }) {
  const [code, setCode] = useState(REJECT_REASONS[0].code)
  const [message, setMessage] = useState(REJECT_REASONS[0].template)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const choose = (reason) => {
    setCode(reason.code)
    if (!touched) setMessage(reason.template)
  }

  const submit = async (e) => {
    e.preventDefault()
    const text = message.trim()
    if (text.length < 10) return setError('Expliquez le motif au citoyen (10 caractères minimum).')
    setError('')
    setSaving(true)
    try {
      await api(`/delegate/requests/${request.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', rejectionCode: code, rejectionReason: text }),
      })
      onDone(text, code)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal reject-modal" onSubmit={submit}>
        <button type="button" className="modal-x" onClick={onClose}><X size={18} /></button>
        <div className="reject-head">
          <span className="reject-icon"><Ban size={22} /></span>
          <div>
            <h3>Désapprouver la demande</h3>
            <p>{request.firstName} {request.lastName} · {request.reference}</p>
          </div>
        </div>
        <div className="reason-list">
          {REJECT_REASONS.map((reason) => (
            <label key={reason.code} className={`reason-option ${code === reason.code ? 'selected' : ''}`}>
              <input type="radio" name="motif" checked={code === reason.code} onChange={() => choose(reason)} />
              <span><strong>{reason.label}</strong><small>{reason.hint}</small></span>
            </label>
          ))}
        </div>
        <div className="field">
          <label>Message envoyé au citoyen *</label>
          <textarea
            rows={4}
            maxLength={600}
            value={message}
            onChange={(e) => { setTouched(true); setMessage(e.target.value); setError('') }}
            placeholder="Expliquez clairement ce que le citoyen doit corriger avant de refaire sa demande."
          />
          <small className="counter">{message.length}/600</small>
        </div>
        {error && <div className="modal-error"><AlertTriangle size={16} />{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>Annuler</button>
          <button className="danger-button" disabled={saving}>{saving ? 'Envoi…' : <><Ban size={17} /> Confirmer le refus</>}</button>
        </div>
      </form>
    </div>
  )
}

function CertificateWorkspace() {
  const id = Number(useLocation().pathname.split('/').pop())
  const navg = useNavigate()
  const { requests, loading } = useRequests()
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const request = requests.find((item) => item.id === id)

  const form = useMemo(() => {
    if (!request) return null
    return {
      birthDate: request.birth_date || '',
      birthPlace: request.birth_place || '',
      identityNumber: request.identity_number || '',
      lotNumber: request.lot_number || '',
      address: request.address || '',
    }
  }, [request])

  if (!request)
    return (
      <Shell>
        <button className="back" onClick={() => navg('/demandes')}>← Retour aux demandes</button>
        <p className="list-state">{loading ? 'Chargement de la demande…' : 'Cette demande est introuvable.'}</p>
      </Shell>
    )

  const treated = request.status === 'approved' || request.status === 'rejected'
  const today = dateFR(new Date())
  const number = String(request.id).padStart(4, '0')

  const approve = async (e) => {
    e.preventDefault()
    if (!form.birthDate || !form.birthPlace || !form.identityNumber || !form.address)
      return setToast({ tone: 'bad', message: 'Date, lieu de naissance, numéro CNI et adresse sont obligatoires.' })
    if (!request.residentSinceYear)
      return setToast({ tone: 'bad', message: 'Le citoyen doit renseigner son année de domiciliation dans Mon compte.' })
    setSaving(true)
    try {
      await api(`/delegate/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ ...form, status: 'approved' }) })
      await refresh()
      setToast({ tone: 'ok', message: 'Le certificat a été généré et envoyé au citoyen.' })
    } catch (error) {
      setToast({ tone: 'bad', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
      <button className="back" onClick={() => navg('/demandes')}>← Retour aux demandes</button>
      <Header
        eyebrow={request.reference}
        title={`${request.firstName} ${request.lastName}`}
        description="Vérifiez la cohérence des informations avec la CNI, puis approuvez ou désapprouvez la demande."
      />

      {request.status === 'rejected' && (
        <div className="match-rule danger">
          <Ban size={22} />
          <div><strong>Demande désapprouvée</strong><span>{request.rejection_reason}</span></div>
        </div>
      )}
      {request.status === 'approved' && (
        <div className="match-rule success">
          <CheckCircle2 size={22} />
          <div><strong>Certificat envoyé</strong><span>Le citoyen peut le télécharger depuis « Mes papiers ».</span></div>
        </div>
      )}

      <div className="entry-workspace">
        <div className="entry-references">
          <article className="panel">
            <div className="panel-head">
              <div><span>Modèle officiel</span><h3>Certificat de domicile</h3></div>
              <a href={uploadUrl(request.templatePath)} target="_blank" rel="noreferrer">Ouvrir</a>
            </div>
            <iframe className="compact-template" src={uploadUrl(request.templatePath)} title="Modèle du certificat" />
          </article>
          <article className="panel">
            <div className="panel-head"><div><span>Justificatifs</span><h3>Carte d’identité</h3></div></div>
            <div className="id-grid">
              <IdentityPreview side="Recto" src={request.idFront} />
              <IdentityPreview side="Verso" src={request.idBack} />
            </div>
          </article>
        </div>

        <form className="panel certificate-entry" onSubmit={approve}>
          <div className="entry-heading">
            <div>
              <strong>{`RÉGION : ${request.region}\nDÉPARTEMENT : ${request.departement}\nCOMMUNE : ${request.commune}\nQUARTIER : ${request.quartier}`}</strong>
              <span>Certificat de domicile</span>
            </div>
            <div>
              <span>{request.commune || 'Keur Massar'}, le <b>{today}</b></span>
              <span>Dossier N° <b>{number}</b></span>
            </div>
          </div>

          <h3>CERTIFICAT DE DOMICILE</h3>

          <div className="certificate-sentence">
            <p>Mr/Mme/Mlle <strong>{request.firstName} {request.lastName}</strong></p>
            <p>Né(e) le <span className="cert-value">{dateFR(form.birthDate) || 'non renseignée'}</span> à <span className="cert-value">{form.birthPlace || 'non renseigné'}</span>,</p>
            <p>fils/fille de <strong>{request.father || 'Non renseigné'}</strong> et de <strong>{request.mother || 'Non renseigné'}</strong>,</p>
            <p>pièce d’identité présentée : <strong>Carte nationale d’identité</strong></p>
            <p>N° <span className="cert-value">{form.identityNumber || 'non renseigné'}</span></p>
            <p className="cert-address">est domicilié(e) à <span className="cert-value cert-value-block">{form.address || 'non renseignée'}</span></p>
            <p>
              dans le quartier depuis <strong className={request.residentSinceYear ? '' : 'missing-value'}>{request.residentSinceYear || 'année non renseignée'}</strong>,
              {' '}villa N° <span className="cert-value cert-value-short">{form.lotNumber || '—'}</span>.
            </p>
          </div>

          <div className="entry-check">
            <CheckCircle2 size={18} />
            <span>Informations fournies par le citoyen · Date automatique : {today} · Numéro automatique : {number}</span>
          </div>

          <div className="entry-actions">
            <button type="button" className="danger-button" disabled={saving || treated} onClick={() => setRejecting(true)}>
              <Ban size={17} />{request.status === 'rejected' ? 'Demande désapprouvée' : 'Désapprouver'}
            </button>
            <button className="primary-button" disabled={saving || treated}>
              <Send size={18} />{request.status === 'approved' ? 'Certificat déjà envoyé' : saving ? 'Génération…' : 'Approuver et envoyer'}
            </button>
          </div>
        </form>
      </div>

      {rejecting && (
        <RejectModal
          request={request}
          onClose={() => setRejecting(false)}
          onDone={async () => {
            setRejecting(false)
            await refresh()
            setToast({ tone: 'ok', message: 'Demande désapprouvée. Le citoyen a reçu votre message.' })
          }}
        />
      )}
      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  )
}

function Profil() {
  const [me, setMe] = useState(null)
  useEffect(() => { api('/me').then(setMe).catch(() => {}) }, [])
  if (!me) return <Shell><p className="list-state">Chargement…</p></Shell>
  const h = me.house || {}
  return (
    <Shell>
      <Header eyebrow="Compte" title="Mes informations" description="Informations du compte et secteur qui vous ont été attribués par l’administrateur." />
      <article className="panel profile-card">
        <div className="profile-avatar">{me.firstName?.[0]}{me.lastName?.[0]}</div>
        <div className="profile-name"><h3>{me.firstName} {me.lastName}</h3><span>{me.email}</span></div>
        <div className="info-list profile-info">
          <div><span>Région</span><strong>{h.region || '—'}</strong></div>
          <div><span>Département</span><strong>{h.departement || '—'}</strong></div>
          <div><span>Commune</span><strong>{h.commune || '—'}</strong></div>
          <div><span>Quartier</span><strong>{h.quartier || 'Non affecté'}</strong></div>
          <div><span>Maison rattachée</span><strong>{h.quartier ? `Maison de ${h.quartier}` : '—'}</strong></div>
        </div>
      </article>
    </Shell>
  )
}

function Protected({ children }) {
  return isLoggedIn() ? children : <Navigate to="/connexion" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/demandes" element={<Protected><Demandes /></Protected>} />
      <Route path="/demandes/:id" element={<Protected><CertificateWorkspace /></Protected>} />
      <Route path="/profil" element={<Protected><Profil /></Protected>} />
      <Route path="*" element={<Navigate to={isLoggedIn() ? '/dashboard' : '/connexion'} replace />} />
    </Routes>
  )
}
