import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ChevronRight, Clock,
  Download, Eye, EyeOff, FileCheck2, FileText, Home, Hourglass, IdCard, Lock, LockKeyhole,
  LogOut, MapPin, Phone, RotateCw, ShieldCheck, Sparkles, UserRound, X, XCircle
} from 'lucide-react'
import { api, isLoggedIn, login, logout as apiLogout, register, uploadUrl } from './api.js'
import { DOCUMENT_TYPES, paperStatus, refreshPapers, resetPapers, usePapers } from './papers-store.js'

const pause = (ms = 550) => new Promise((resolve) => setTimeout(resolve, ms))

const DEMO_PROFILE = {
  firstName: '',
  lastName: '',
  phone: '',
  pin: '',
  fatherFirstName: '',
  fatherLastName: '',
  motherFirstName: '',
  motherLastName: '',
  birthDate: '',
  birthPlace: '',
  identityNumber: '',
  villaNumber: '',
  idFront: '',
  idBack: '',
  residentSinceYear: '',
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  const parts = []
  if (digits.length) parts.push(digits.slice(0, 2))
  if (digits.length > 2) parts.push(digits.slice(2, 5))
  if (digits.length > 5) parts.push(digits.slice(5, 7))
  if (digits.length > 7) parts.push(digits.slice(7, 9))
  return parts.join(' ')
}

function phoneDigits(value) {
  return value.replace(/\D/g, '').slice(0, 9)
}

function getProfile() {
  try {
    return { ...DEMO_PROFILE, ...JSON.parse(localStorage.getItem('sunu_citizen_profile') || '{}') }
  } catch {
    return DEMO_PROFILE
  }
}

function saveProfile(profile) {
  localStorage.setItem('sunu_citizen_profile', JSON.stringify(profile))
}

const isAuthenticated = isLoggedIn

function Logo({ mobile = false, compact = false }) {
  return (
    <div className={`${mobile ? 'logo mobile-logo' : 'logo'} ${compact ? 'compact-logo' : ''}`}>
      <span className="logo-mark"><FileCheck2 size={compact ? 18 : 21} strokeWidth={2.4} /></span>
      <span className="logo-text">Sunu Papier</span>
    </div>
  )
}

function BrandPane() {
  return (
    <aside className="brand-pane">
      <div className="brand-top">
        <Logo />
        <span className="role-chip">Espace citoyen</span>
      </div>
      <div className="brand-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> Vos démarches, simplement.</div>
        <h1>Vos papiers administratifs, sans complications.</h1>
        <p>Connectez-vous à votre espace citoyen pour demander et conserver vos documents administratifs depuis n’importe quel appareil.</p>
        <div className="feature-row">
          <span className="feature-pill"><ShieldCheck size={15} /> Accès sécurisé</span>
          <span className="feature-pill"><Sparkles size={15} /> Simple et rapide</span>
          <span className="feature-pill"><FileCheck2 size={15} /> Documents centralisés</span>
        </div>
      </div>
      <div className="brand-footer">© 2026 Sunu Papier · Sénégal</div>
    </aside>
  )
}

function Field({ label, icon: Icon, error, hint, children }) {
  return (
    <div className="field">
      <div className="field-heading">
        <label>{label}</label>
        {hint && <span>{hint}</span>}
      </div>
      <div className={`input-wrap ${error ? 'has-error' : ''}`}>
        <Icon size={18} />
        {children}
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, 2800)
    return () => clearTimeout(id)
  }, [onClose])

  return (
    <div className="toast" role="status">
      <CheckCircle2 size={20} />
      <div><strong>C’est fait</strong><span>{message}</span></div>
    </div>
  )
}

function ForgotModal({ onClose, onDone }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (phoneDigits(phone).length !== 9) return setError('Le numéro doit contenir exactement 9 chiffres.')
    setError('')
    setLoading(true)
    await pause()
    setLoading(false)
    onDone('Les instructions de récupération ont été simulées par SMS.')
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-top">
          <div><h3>Code PIN oublié ?</h3><p>Renseignez votre numéro à 9 chiffres pour recevoir les instructions.</p></div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <Field label="Numéro de téléphone" icon={Phone} error={error} hint="9 chiffres">
          <input
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="77 123 45 67"
            inputMode="numeric"
            autoFocus
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
          <button className="primary-button" disabled={loading}>{loading ? <span className="loader" /> : 'Continuer'}</button>
        </div>
      </form>
    </div>
  )
}

function Login() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [errors, setErrors] = useState({})
  const [forgot, setForgot] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (phoneDigits(phone).length !== 9) next.phone = 'Le numéro doit contenir exactement 9 chiffres.'
    if (!/^\d{6}$/.test(pin)) next.pin = 'Le code PIN doit contenir exactement 6 chiffres.'
    setErrors(next)
    if (Object.keys(next).length) return

    const enteredPhone = phoneDigits(phone)
    setLoading(true)
    try {
      const result = await login(enteredPhone, pin)
      saveProfile({ ...DEMO_PROFILE, ...result.user, pin })
      navigate('/app/home', { replace: true })
    } catch (error) { setErrors({ pin: error.message }) }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-shell">
      <BrandPane />
      <main className="form-pane">
        <form className="form-card" onSubmit={submit} noValidate>
          <Logo mobile />
          <p className="form-kicker">Bienvenue</p>
          <h2>Connexion citoyen</h2>
          <p className="form-subtitle">Accédez à votre espace avec votre numéro de téléphone et votre code PIN.</p>
          <Field label="Numéro de téléphone" icon={Phone} error={errors.phone} hint="9 chiffres">
            <input
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="77 123 45 67"
            />
          </Field>
          <Field label="Code PIN" icon={LockKeyhole} error={errors.pin}>
            <input
              inputMode="numeric"
              autoComplete="current-password"
              type={showPin ? 'text' : 'password'}
              value={pin}
              maxLength={6}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
            />
            <button type="button" className="icon-action" onClick={() => setShowPin((v) => !v)} aria-label="Afficher le code PIN">{showPin ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </Field>
          <div className={`pin-counter ${pin.length === 6 ? 'ok' : ''}`}>{pin.length}/6 chiffres</div>
          <div className="form-meta"><button type="button" className="text-button" onClick={() => setForgot(true)}>Code PIN oublié ?</button></div>
          <button className="primary-button" disabled={loading}>{loading ? <span className="loader" /> : <>Se connecter <ArrowRight size={18}/></>}</button>
          <div className="divider">ou</div>
          <div className="account-cta">Vous n’avez pas encore de compte ? <Link to="/inscription">Créer un compte</Link></div>
        </form>
      </main>
      {forgot && <ForgotModal onClose={() => setForgot(false)} onDone={setToast} />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', pin: '' })
  const [showPin, setShowPin] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (form.firstName.trim().length < 2) next.firstName = 'Renseignez votre prénom.'
    if (form.lastName.trim().length < 2) next.lastName = 'Renseignez votre nom.'
    if (phoneDigits(form.phone).length !== 9) next.phone = 'Le numéro doit contenir exactement 9 chiffres.'
    if (!/^\d{6}$/.test(form.pin)) next.pin = 'Le code PIN doit contenir exactement 6 chiffres.'
    setErrors(next)
    if (Object.keys(next).length) return

    setLoading(true)
    try {
      const payload={firstName:form.firstName.trim(),lastName:form.lastName.trim(),phone:phoneDigits(form.phone),pin:form.pin}
      await register(payload); saveProfile({...DEMO_PROFILE,...payload})
      setToast('Compte citoyen créé. Votre espace est prêt.')
      setTimeout(() => navigate('/app/home'), 600)
    } catch(error) { setErrors({phone:error.message}) }
    finally { setLoading(false) }
  }

  return (
    <div className="auth-shell">
      <BrandPane />
      <main className="form-pane">
        <form className="form-card register-card" onSubmit={submit} noValidate>
          <Logo mobile />
          <Link to="/connexion" className="back-link"><ArrowLeft size={16}/> Retour à la connexion</Link>
          <p className="form-kicker">Nouveau compte</p>
          <h2>Créer votre espace</h2>
          <p className="form-subtitle">Renseignez vos informations pour commencer vos démarches avec Sunu Papier.</p>
          <div className="two-col">
            <Field label="Prénom" icon={UserRound} error={errors.firstName}>
              <input autoComplete="given-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="Mamadou" />
            </Field>
            <Field label="Nom" icon={UserRound} error={errors.lastName}>
              <input autoComplete="family-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Ndiaye" />
            </Field>
          </div>
          <Field label="Numéro de téléphone" icon={Phone} error={errors.phone} hint="9 chiffres">
            <input
              inputMode="numeric"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set('phone', formatPhone(e.target.value))}
              placeholder="77 123 45 67"
            />
          </Field>
          <Field label="Code PIN à 6 chiffres" icon={LockKeyhole} error={errors.pin}>
            <input inputMode="numeric" type={showPin ? 'text' : 'password'} value={form.pin} maxLength={6} onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" />
            <button type="button" className="icon-action" onClick={() => setShowPin((v) => !v)} aria-label="Afficher le code PIN">{showPin ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </Field>
          <div className={`pin-counter ${form.pin.length === 6 ? 'ok' : ''}`}>{form.pin.length}/6 chiffres</div>
          <button className="primary-button register-submit" disabled={loading}>{loading ? <span className="loader" /> : <>Créer mon compte <ArrowRight size={18}/></>}</button>
        </form>
      </main>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

function PinGate({ title, onCancel, onSuccess }) {
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => inputRef.current?.focus(), [])

  const submit = (e) => {
    e.preventDefault()
    if (pin.length !== 6) return setError('Saisissez votre code PIN à 6 chiffres.')
    if (pin !== getProfile().pin) {
      setError('Code PIN incorrect.')
      setPin('')
      return
    }
    onSuccess()
  }

  return (
    <div className="modal-backdrop pin-backdrop">
      <form className="pin-modal" onSubmit={submit}>
        <div className="pin-shield"><LockKeyhole size={25} /></div>
        <p className="form-kicker">Accès protégé</p>
        <h3>{title}</h3>
        <p>Confirmez votre identité avec votre code PIN pour ouvrir cette page.</p>
        <div className={`pin-input ${error ? 'has-error' : ''}`}>
          <LockKeyhole size={18} />
          <input
            ref={inputRef}
            inputMode="numeric"
            type={showPin ? 'text' : 'password'}
            maxLength={6}
            value={pin}
            onChange={(e) => { setError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 6)) }}
            placeholder="••••••"
          />
          <button type="button" onClick={() => setShowPin((v) => !v)} aria-label="Afficher le PIN">{showPin ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
        </div>
        {error && <div className="pin-error">{error}</div>}
        <div className="pin-dots" aria-hidden="true">{[0,1,2,3,4,5].map((i) => <span key={i} className={i < pin.length ? 'filled' : ''} />)}</div>
        <button className="primary-button">Déverrouiller</button>
        <button type="button" className="cancel-link" onClick={onCancel}>Retour à l’accueil</button>
      </form>
    </div>
  )
}

function BottomNav({ onProtectedNavigate }) {
  const navigate = useNavigate()
  const location = useLocation()

  const items = [
    { label: 'Accueil', icon: Home, path: '/app/home', protected: false },
    { label: 'Mes papiers', icon: FileText, path: '/app/mes-papiers', protected: false },
    { label: 'Mon compte', icon: UserRound, path: '/app/mon-compte', protected: false },
  ]

  return (
    <nav className="bottom-nav" aria-label="Navigation citoyen">
      {items.map(({ label, icon: Icon, path, protected: locked }) => {
        const active = location.pathname === path
        return (
          <button
            key={path}
            className={active ? 'active' : ''}
            onClick={() => locked ? onProtectedNavigate(path, label) : navigate(path)}
          >
            <span className="nav-icon"><Icon size={20} strokeWidth={active ? 2.5 : 2} />{locked && <span className="mini-lock"><LockKeyhole size={8}/></span>}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function AppHeader({ profile }) {
  const navigate = useNavigate()
  const logout = () => {
    apiLogout()
    resetPapers()
    navigate('/connexion', { replace: true })
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Logo compact />
        <div className="header-actions">
          <div className="user-pill">
            <span>{(profile.firstName?.[0] || 'C').toUpperCase()}</span>
            <div><strong>{profile.firstName || 'Citoyen'}</strong><small>{formatPhone(profile.phone)}</small></div>
          </div>
          <button className="logout-button" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={18}/></button>
        </div>
      </div>
    </header>
  )
}

function HomePage({ profile }) {
  const navigate = useNavigate()
  return (
    <div className="page-content home-page">
      <section className="welcome-block">
        <div>
          <p className="page-eyebrow">Espace citoyen</p>
          <h1>Bonjour {profile.firstName || 'Citoyen'} 👋</h1>
          <p>Quel document administratif souhaitez-vous demander ?</p>
        </div>
        <div className="secure-chip"><ShieldCheck size={17}/> Espace sécurisé</div>
      </section>

      <section className="documents-section">
        <div className="section-heading">
          <div><h2>Mes démarches administratives</h2><p>Les documents disponibles apparaissent ici.</p></div>
          <span className="count-badge">1 service disponible</span>
        </div>

        <div className="documents-grid">
          <button className="document-card" type="button" onClick={()=>navigate('/app/nouvelle-demande')}>
            <div className="document-icon"><FileText size={28}/></div>
            <div className="document-copy">
              <div className="available-label"><span/> Disponible</div>
              <h3>Certificat de domicile</h3>
              <p>Effectuez votre demande de certificat de domicile depuis votre espace citoyen.</p>
            </div>
            <span className="document-arrow"><ChevronRight size={21}/></span>
          </button>

          <div className="document-card is-soon" aria-disabled="true">
            <div className="document-icon"><Home size={28}/></div>
            <div className="document-copy">
              <div className="soon-label"><Clock size={13}/> Bientôt disponible</div>
              <h3>Certificat de résidence</h3>
              <p>Ce service sera ouvert prochainement depuis votre espace citoyen.</p>
            </div>
            <span className="document-arrow soon"><Lock size={18}/></span>
          </div>
        </div>
      </section>
    </div>
  )
}

const dateFR = (value) =>
  value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)) : ''

function PaperCard({ paper, onRedo }) {
  const meta = paperStatus(paper.status)
  const Icon = meta.tone === 'ok' ? CheckCircle2 : meta.tone === 'bad' ? XCircle : Hourglass
  return (
    <article className={`paper-card tone-${meta.tone}`}>
      <div className="paper-card-head">
        <span className="paper-icon"><FileText size={20} /></span>
        <div className="paper-title">
          <h3>{paper.type}</h3>
          <span>{paper.reference} · demandé le {dateFR(paper.submittedAt)}</span>
        </div>
        <span className={`paper-badge tone-${meta.tone}`}><Icon size={14} />{meta.label}</span>
      </div>

      <p className="paper-help">{meta.help}</p>

      {paper.status === 'rejected' && paper.rejectionReason && (
        <div className="paper-reason">
          <AlertCircle size={18} />
          <div><strong>Motif du refus</strong><p>{paper.rejectionReason}</p></div>
        </div>
      )}

      <div className="paper-card-foot">
        <span className="paper-address"><MapPin size={15} />{paper.address}</span>
        {paper.status === 'approved' && paper.certificatePath && (
          <a className="save-button" href={uploadUrl(paper.certificatePath)} target="_blank" rel="noreferrer">
            <Download size={17} /> Télécharger le certificat
          </a>
        )}
        {paper.status === 'rejected' && (
          <button type="button" className="secondary-button" onClick={onRedo}>Refaire une demande</button>
        )}
      </div>
    </article>
  )
}

function PapersPage() {
  const navigate = useNavigate()
  const { papers, loading, refreshing, error } = usePapers()
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('domicile')

  const typeFilter = DOCUMENT_TYPES.find((t) => t.value === type)

  const byType = useMemo(
    () => papers.filter((p) => !typeFilter || typeFilter.match.test(p.type || '')),
    [papers, typeFilter],
  )

  const counts = useMemo(() => ({
    all: byType.length,
    pending: byType.filter((p) => p.status === 'pending' || p.status === 'processing').length,
    approved: byType.filter((p) => p.status === 'approved').length,
    rejected: byType.filter((p) => p.status === 'rejected').length,
  }), [byType])

  const filtered = useMemo(() => {
    const rows = status === 'all'
      ? byType
      : status === 'pending'
        ? byType.filter((p) => p.status === 'pending' || p.status === 'processing')
        : byType.filter((p) => p.status === status)
    // Les demandes en attente d'abord, puis les plus récentes.
    return [...rows].sort((a, b) => {
      const openA = a.status === 'pending' || a.status === 'processing' ? 0 : 1
      const openB = b.status === 'pending' || b.status === 'processing' ? 0 : 1
      if (openA !== openB) return openA - openB
      return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
    })
  }, [byType, status])

  return (
    <div className="page-content">
      <section className="page-title-row">
        <div>
          <p className="page-eyebrow">Documents</p>
          <h1>Mes papiers</h1>
          <p>Retrouvez ici vos demandes et les certificats obtenus avec Sunu Papier.</p>
        </div>
        <div className="page-icon-box"><FileCheck2 size={26} /></div>
      </section>

      <div className="paper-filters">
        <label className="filter-field">
          <span>Type de document</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value} disabled={!t.available}>
                {t.available ? t.label : `${t.label} — bientôt disponible`}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Statut</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tous ({counts.all})</option>
            <option value="pending">En attente ({counts.pending})</option>
            <option value="approved">Approuvés ({counts.approved})</option>
            <option value="rejected">Désapprouvés ({counts.rejected})</option>
          </select>
        </label>
        <button type="button" className="refresh-button" onClick={refreshPapers} disabled={refreshing} title="Actualiser">
          <RotateCw size={17} className={refreshing ? 'spinning' : ''} />
          <span>{refreshing ? 'Actualisation…' : 'Actualiser'}</span>
        </button>
      </div>

      {error && papers.length === 0 && <div className="paper-error"><AlertCircle size={18} />{error}</div>}

      {loading && papers.length === 0 ? (
        <section className="paper-list-card"><p className="paper-loading">Chargement de vos documents…</p></section>
      ) : filtered.length === 0 ? (
        <section className="paper-list-card">
          <div className="empty-paper-icon"><FileText size={28} /></div>
          <h2>{papers.length === 0 ? 'Aucun certificat pour le moment' : 'Aucun document dans ce filtre'}</h2>
          <p>{papers.length === 0 ? 'Vos demandes et certificats apparaîtront ici.' : 'Changez de statut ou de type de document pour voir vos autres demandes.'}</p>
        </section>
      ) : (
        <section className="paper-list">
          {filtered.map((paper) => (
            <PaperCard key={paper.id} paper={paper} onRedo={() => navigate('/app/nouvelle-demande')} />
          ))}
        </section>
      )}
    </div>
  )
}

function UploadCard({ label, value, onChange }) {
  const inputRef = useRef(null)
  const handleFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result)
    reader.readAsDataURL(file)
  }

  return (
    <div className={`upload-card ${value ? 'has-image' : ''}`}>
      <input ref={inputRef} hidden type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} />
      {value ? (
        <>
          <img src={value.startsWith('data:') || value.startsWith('blob:') ? value : uploadUrl(value)} alt={label} />
          <div className="upload-overlay"><Check size={18}/><span>{label} ajouté</span></div>
          <button type="button" className="replace-photo" onClick={() => inputRef.current?.click()}><Camera size={16}/> Modifier</button>
        </>
      ) : (
        <button type="button" className="upload-empty" onClick={() => inputRef.current?.click()}>
          <span className="upload-icon"><IdCard size={26}/></span>
          <strong>{label}</strong>
          <small>Ajouter une photo</small>
        </button>
      )}
    </div>
  )
}

function AccountPage({ profile, setProfile, setToast }) {
  const [form, setForm] = useState(profile)
  const [saved, setSaved] = useState(false)
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const updated = { ...form, phone: phoneDigits(form.phone) }
    const body=new FormData()
    Object.entries(updated).forEach(([key,value])=>{if(key!=='pin'&&key!=='idFront'&&key!=='idBack')body.append(key,value||'')})
    const appendImage=async(key,value)=>{if(typeof value==='string'&&value.startsWith('data:'))body.append(key,await (await fetch(value)).blob(),`${key}.jpg`)}
    try { await appendImage('idFront',updated.idFront);await appendImage('idBack',updated.idBack);await api('/me/citizen',{method:'PUT',body});saveProfile(updated);setProfile(updated);setSaved(true);setToast('Vos informations personnelles ont été enregistrées.');setTimeout(()=>setSaved(false),1800) }
    catch(error){setToast(error.message)}
  }

  return (
    <div className="page-content account-page">
      <section className="page-title-row">
        <div>
          <p className="page-eyebrow">Profil sécurisé</p>
          <h1>Mon compte</h1>
          <p>Complétez les informations qui serviront à vos prochaines démarches administratives.</p>
        </div>
        <div className="page-icon-box"><UserRound size={26}/></div>
      </section>

      <form className="profile-form" onSubmit={submit}>
        <section className="profile-section">
          <div className="profile-section-title"><span>01</span><div><h2>Informations personnelles</h2><p>Informations renseignées lors de votre inscription.</p></div></div>
          <div className="profile-grid">
            <label><span>Prénom</span><input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></label>
            <label><span>Nom</span><input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
            <label className="full"><span>Numéro de téléphone</span><input inputMode="numeric" value={formatPhone(form.phone)} onChange={(e) => set('phone', phoneDigits(e.target.value))} placeholder="77 123 45 67" /></label>
            <label><span>Date de naissance</span><input required type="date" value={form.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} /></label>
            <label><span>Lieu de naissance</span><input required value={form.birthPlace || ''} onChange={(e) => set('birthPlace', e.target.value)} placeholder="Ex. Dakar" /></label>
            <label><span>Numéro CNI</span><input required value={form.identityNumber || ''} onChange={(e) => set('identityNumber', e.target.value)} placeholder="Numéro de la carte d’identité" /></label>
            <label><span>Numéro de villa</span><input required value={form.villaNumber || ''} onChange={(e) => set('villaNumber', e.target.value)} placeholder="Ex. 143" /></label>
            <label className="full"><span>Domicilié(e) dans le quartier depuis</span><input inputMode="numeric" maxLength={4} value={form.residentSinceYear||''} onChange={(e)=>set('residentSinceYear',e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="Ex. 2018" /></label>
          </div>
        </section>

        <section className="profile-section">
          <div className="profile-section-title"><span>02</span><div><h2>Informations des parents</h2><p>Renseignez le prénom et le nom du père et de la mère.</p></div></div>
          <div className="parent-block">
            <div className="parent-label">Père</div>
            <div className="profile-grid">
              <label><span>Prénom du père</span><input value={form.fatherFirstName} onChange={(e) => set('fatherFirstName', e.target.value)} placeholder="Prénom" /></label>
              <label><span>Nom du père</span><input value={form.fatherLastName} onChange={(e) => set('fatherLastName', e.target.value)} placeholder="Nom" /></label>
            </div>
          </div>
          <div className="parent-block">
            <div className="parent-label">Mère</div>
            <div className="profile-grid">
              <label><span>Prénom de la mère</span><input value={form.motherFirstName} onChange={(e) => set('motherFirstName', e.target.value)} placeholder="Prénom" /></label>
              <label><span>Nom de la mère</span><input value={form.motherLastName} onChange={(e) => set('motherLastName', e.target.value)} placeholder="Nom" /></label>
            </div>
          </div>
        </section>

        <section className="profile-section">
          <div className="profile-section-title"><span>03</span><div><h2>Carte nationale d’identité</h2><p>Ajoutez une photo nette du recto et du verso de votre carte.</p></div></div>
          <div className="uploads-grid">
            <UploadCard label="CNI — Recto" value={form.idFront} onChange={(value) => set('idFront', value)} />
            <UploadCard label="CNI — Verso" value={form.idBack} onChange={(value) => set('idBack', value)} />
          </div>
        </section>

        <div className="profile-save-bar">
          <div><ShieldCheck size={18}/><span>Ces données sont protégées par votre code PIN.</span></div>
          <button className={`save-button ${saved ? 'saved' : ''}`} type="submit">{saved ? <><Check size={18}/> Enregistré</> : 'Enregistrer les modifications'}</button>
        </div>
      </form>
    </div>
  )
}

function RequestPage({ setToast }) {
  const navigate=useNavigate(); const [houses,setHouses]=useState([]); const [houseId,setHouseId]=useState(''); const [loading,setLoading]=useState(false); const [loadingHouses,setLoadingHouses]=useState(true); const [housesError,setHousesError]=useState('')
  useEffect(()=>{api('/houses').then(setHouses).catch(e=>{setHousesError(e.message);setToast(e.message)}).finally(()=>setLoadingHouses(false))},[setToast])
  const submit=async(e)=>{e.preventDefault();if(!houseId){setToast('Choisissez une administration.');return}setLoading(true);try{const result=await api('/requests',{method:'POST',body:JSON.stringify({houseId:Number(houseId)})});setToast(`Demande ${result.reference} envoyée.`);refreshPapers();navigate('/app/mes-papiers')}catch(error){setToast(error.message)}finally{setLoading(false)}}
  return <div className="page-content account-page"><section className="page-title-row"><div><p className="page-eyebrow">Nouvelle démarche</p><h1>Certificat de domicile</h1><p>La demande sera transmise à l’administration de quartier sélectionnée.</p></div><div className="page-icon-box"><FileText size={26}/></div></section><form className="profile-form" onSubmit={submit}><section className="profile-section"><div className="profile-section-title"><span>01</span><div><h2>Administration</h2><p>Sélectionnez la maison du délégué correspondant à votre quartier.</p></div></div><div className="profile-grid"><label className="full"><span>Administration de quartier</span><select value={houseId} onChange={e=>setHouseId(e.target.value)} disabled={loadingHouses||Boolean(housesError)}><option value="">{loadingHouses?'Chargement des administrations…':'Choisir une administration'}</option>{houses.map(h=><option key={h.id} value={h.id}>Maison de quartier de {h.quartier} — {h.commune}, {h.departement}</option>)}</select></label>{!loadingHouses&&!housesError&&houses.length===0&&<p className="full">Aucune administration de quartier n’est disponible pour le moment.</p>}{housesError&&<p className="full">Impossible de charger les administrations : {housesError}</p>}</div></section><div className="profile-save-bar"><div><ShieldCheck size={18}/><span>Votre dossier sera accessible uniquement au délégué affecté à cette administration.</span></div><button className="save-button" disabled={loading||loadingHouses||houses.length===0}>{loading?'Envoi…':'Envoyer la demande'}</button></div></form></div>
}

function ProtectedApp() {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(getProfile())
  const [toast, setToast] = useState('')
  const [gate, setGate] = useState(null)
  const [unlockedPath, setUnlockedPath] = useState('/app/home')

  useEffect(()=>{api('/me').then(data=>{const next={...DEMO_PROFILE,...data,...data.profile,pin:getProfile().pin};saveProfile(next);setProfile(next)}).catch(()=>{})},[])

  useEffect(() => {
    if (!isAuthenticated()) return
    const protectedPaths = []
    if (protectedPaths.includes(location.pathname) && unlockedPath !== location.pathname && !gate) {
      const label = location.pathname.includes('mes-papiers') ? 'Mes papiers' : 'Mon compte'
      setGate({ path: location.pathname, label, direct: true })
    }
  }, [location.pathname, unlockedPath, gate])

  if (!isAuthenticated()) return <Navigate to="/connexion" replace />

  const protectedNavigate = (path, label) => {
    if (location.pathname === path && unlockedPath === path) return
    setGate({ path, label, direct: false })
  }

  const unlock = () => {
    const path = gate.path
    setUnlockedPath(path)
    setGate(null)
    navigate(path)
  }

  const cancelGate = () => {
    setGate(null)
    setUnlockedPath('/app/home')
    navigate('/app/home', { replace: true })
  }

  return (
    <div className="citizen-app">
      <AppHeader profile={profile} />
      <main className="app-main">
        <Routes>
          <Route path="home" element={<HomePage profile={profile} />} />
          <Route path="nouvelle-demande" element={<RequestPage setToast={setToast} />} />
          <Route path="mes-papiers" element={<PapersPage />} />
          <Route path="mon-compte" element={<AccountPage profile={profile} setProfile={setProfile} setToast={setToast} />} />
          <Route path="*" element={<Navigate to="home" replace />} />
        </Routes>
      </main>
      <BottomNav onProtectedNavigate={protectedNavigate} />
      {gate && <PinGate title={`Ouvrir « ${gate.label} »`} onCancel={cancelGate} onSuccess={unlock} />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthenticated() ? '/app/home' : '/connexion'} replace />} />
      <Route path="/connexion" element={isAuthenticated() ? <Navigate to="/app/home" replace /> : <Login />} />
      <Route path="/inscription" element={isAuthenticated() ? <Navigate to="/app/home" replace /> : <Register />} />
      <Route path="/app/*" element={<ProtectedApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
