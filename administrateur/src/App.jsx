import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight, BarChart3, Building2, CheckCircle2, ChevronRight, ClipboardList, Copy,
  Eye, EyeOff, FileCheck2, FileText, Home, Image as ImageIcon, KeyRound, LockKeyhole,
  LogOut, Mail, MapPin, Menu, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Upload, UserPlus, Users, X
} from 'lucide-react'
import { api, isLoggedIn, login, logout as apiLogout } from './api.js'

const pause = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms))

const DEFAULT_DELEGATES = [
  { id: 'd1', firstName: 'Moussa', lastName: 'Diop', email: 'moussa.diop@sunupapier.sn', password: 'Su#9gH2!pQ', quartier: 'Grand-Yoff' },
  { id: 'd2', firstName: 'Awa', lastName: 'Ndiaye', email: 'awa.ndiaye@sunupapier.sn', password: 'Ay#6Lm8!tR', quartier: 'Sacré-Cœur 3' },
]

const DEFAULT_HOUSES = [
  { id: 'h1', region: 'Dakar', departement: 'Dakar', commune: 'Grand Yoff', quartier: 'Grand-Yoff', delegateId: 'd1', certificate: 'modele-certificat-grand-yoff.pdf', signature: 'signature.png', stamp: 'cachet.png' },
  { id: 'h2', region: 'Dakar', departement: 'Dakar', commune: 'Mermoz-Sacré-Cœur', quartier: 'Sacré-Cœur 3', delegateId: 'd2', certificate: 'modele-certificat-sacre-coeur.pdf', signature: 'signature.jpg', stamp: 'cachet.png' },
]

function readStore(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    return saved || fallback
  } catch {
    return fallback
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function randomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  let value = ''
  const cryptoObj = window.crypto
  if (cryptoObj?.getRandomValues) {
    const values = new Uint32Array(length)
    cryptoObj.getRandomValues(values)
    values.forEach((n) => { value += chars[n % chars.length] })
    return value
  }
  for (let i = 0; i < length; i += 1) value += chars[Math.floor(Math.random() * chars.length)]
  return value
}

function Logo() {
  return <div className="app-logo"><span><FileCheck2 size={20} /></span><strong>Sunu Papier</strong></div>
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const id = setTimeout(onClose, 3000)
    return () => clearTimeout(id)
  }, [onClose])
  return <div className="toast"><CheckCircle2 size={20}/><div><strong>Enregistré</strong><span>{message}</span></div></div>
}

function Field({ label, icon: Icon, error, children, hint }) {
  return <div className="field"><div className="field-title"><label>{label}</label>{hint && <span>{hint}</span>}</div><div className={`input-wrap ${error ? 'has-error' : ''}`}><Icon size={18}/>{children}</div>{error && <small className="error-text">{error}</small>}</div>
}

function ForgotModal({ onClose, onDone }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Adresse e-mail invalide.')
    onDone('Les instructions de réinitialisation ont été simulées.')
    onClose()
  }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><button className="modal-x" type="button" onClick={onClose}><X size={18}/></button><div className="modal-icon"><KeyRound size={22}/></div><h3>Mot de passe oublié</h3><p>Saisissez l’adresse e-mail du compte administrateur.</p><Field label="Adresse e-mail" icon={Mail} error={error}><input autoFocus type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="admin@sunupapier.sn"/></Field><button className="primary-button">Envoyer le lien</button></form></div>
}

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [forgot, setForgot] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Saisissez une adresse e-mail valide.'
    if (password.length < 6) next.password = '6 caractères minimum.'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    try { await login(email, password); navigate('/dashboard') }
    catch (error) { setErrors({ password: error.message }) }
    finally { setLoading(false) }
  }

  return <div className="auth-shell admin-auth"><aside className="auth-brand"><div className="auth-top"><Logo/><span className="role-chip">Administrateur</span></div><div className="auth-copy"><div className="eyebrow"><Sparkles size={15}/> Administration centrale</div><h1>Supervisez Sunu Papier depuis un espace unique.</h1><p>Gérez les délégués, les maisons de chef de quartier et les documents administratifs depuis une interface claire et sécurisée.</p><div className="auth-pills"><span><ShieldCheck size={15}/> Sécurisé</span><span><Building2 size={15}/> Quartiers</span><span><ClipboardList size={15}/> Demandes</span></div></div></aside><main className="auth-form"><form className="login-card" onSubmit={submit}><Logo/><p className="kicker">Accès professionnel</p><h2>Connexion administrateur</h2><p className="subtitle">Connectez-vous avec vos identifiants d’administration.</p><Field label="Adresse e-mail" icon={Mail} error={errors.email}><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="admin@sunupapier.sn"/></Field><Field label="Mot de passe" icon={LockKeyhole} error={errors.password}><input type={show?'text':'password'} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Votre mot de passe"/><button type="button" className="icon-button" onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></Field><button type="button" className="forgot-link" onClick={()=>setForgot(true)}>Mot de passe oublié ?</button><button className="primary-button" disabled={loading}>{loading?<span className="loader"/>:<>Se connecter <ArrowRight size={18}/></>}</button></form></main>{forgot&&<ForgotModal onClose={()=>setForgot(false)} onDone={setToast}/>} {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</div>
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { path: '/maisons', label: 'Maison chef du quartier', icon: Home },
  { path: '/delegues', label: 'Délégué du quartier', icon: Users },
  { path: '/documents', label: 'Document administratif', icon: FileText },
]

function AppShell({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const logout = () => { apiLogout(); navigate('/connexion') }
  return <div className="workspace"><aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-head"><Logo/><button className="mobile-close" onClick={()=>setOpen(false)}><X size={20}/></button></div><div className="sidebar-role">Espace administrateur</div><nav>{navItems.map(({path,label,icon:Icon})=><button key={path} className={location.pathname===path?'active':''} onClick={()=>{navigate(path);setOpen(false)}}><Icon size={19}/><span>{label}</span><ChevronRight className="nav-arrow" size={16}/></button>)}</nav><button className="logout-button" onClick={logout}><LogOut size={18}/> Déconnexion</button></aside><div className="main-area"><header className="topbar"><button className="menu-button" onClick={()=>setOpen(true)}><Menu size={21}/></button><div><strong>Administration</strong><span>Sunu Papier</span></div><div className="admin-avatar">AD</div></header><main className="content">{children}</main></div>{open&&<button className="sidebar-overlay" onClick={()=>setOpen(false)} aria-label="Fermer le menu"/>}</div>
}

function PageHeader({ eyebrow, title, description, action }) {
  return <div className="page-header"><div><span className="page-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function StatCard({ icon: Icon, label, value, note }) {
  return <article className="stat-card"><div className="stat-icon"><Icon size={21}/></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>
}

function DashboardPage() {
  const [stats,setStats]=useState({houses:0,citizens:0,requests:0,pending:0,delegates:0})
  useEffect(()=>{api('/admin/dashboard').then(setStats).catch(()=>{})},[])
  return <AppShell><PageHeader eyebrow="Vue d’ensemble" title="Dashboard" description="Suivez les principaux indicateurs de la plateforme Sunu Papier."/><section className="stats-grid"><StatCard icon={Home} label="Maisons de chef de quartier" value={stats.houses} note="Maisons configurées"/><StatCard icon={Users} label="Citoyens inscrits" value={stats.citizens} note="Comptes réels"/><StatCard icon={ClipboardList} label="Demandes faites" value={stats.requests} note={`${stats.pending} en attente`}/><StatCard icon={UserPlus} label="Délégués actifs" value={stats.delegates} note="Comptes créés"/></section><section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><span>Activité</span><h3>Demandes administratives</h3></div><span className="soft-badge">Temps réel</span></div><div className="progress-list"><div><span><i/>En attente</span><strong>{stats.pending}</strong><b style={{width:`${stats.requests?stats.pending/stats.requests*100:0}%`}}/></div></div></article><article className="panel"><div className="panel-head"><div><span>Document actif</span><h3>Certificat de domicile</h3></div><FileCheck2 size={24}/></div><p className="panel-copy">Les demandes sont acheminées vers le délégué correspondant au quartier sélectionné.</p><div className="rule-card"><ShieldCheck size={19}/><div><strong>Affectation par quartier</strong><span>Maison ↔ délégué</span></div></div></article></section></AppShell>
}

function DelegateEditModal({ delegate, onClose, onSaved, onError }) {
  const [form,setForm]=useState({firstName:delegate.firstName,lastName:delegate.lastName,email:delegate.email,password:''})
  const [saving,setSaving]=useState(false)
  const submit=async(e)=>{e.preventDefault();setSaving(true);try{const updated=await api(`/admin/delegates/${delegate.id}`,{method:'PUT',body:JSON.stringify(form)});onSaved(updated)}catch(error){onError(error.message)}finally{setSaving(false)}}
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal edit-modal" onSubmit={submit}><button type="button" className="modal-x" onClick={onClose}><X size={18}/></button><h3>Modifier le délégué</h3><p>Toutes les informations modifiables sont regroupées ici.</p><div className="form-grid"><Field label="Prénom" icon={Users}><input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></Field><Field label="Nom" icon={Users}><input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></Field></div><Field label="Adresse e-mail" icon={Mail}><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field><Field label="Nouveau mot de passe" icon={LockKeyhole} hint="laisser vide pour conserver l’actuel"><input value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Mot de passe inchangé"/></Field><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" disabled={saving}>{saving?'Enregistrement…':'Enregistrer'}</button></div></form></div>
}

function HouseEditModal({ house, delegates, onClose, onSaved, onError }) {
  const [form,setForm]=useState({region:house.region,departement:house.departement,commune:house.commune,quartier:house.quartier,delegateId:String(house.delegate_id||''),certificate:null,signature:null,stamp:null})
  const [saving,setSaving]=useState(false)
  const submit=async(e)=>{e.preventDefault();setSaving(true);const body=new FormData();Object.entries(form).forEach(([k,v])=>{if(v)body.append(k,v)});try{await api(`/admin/houses/${house.id}`,{method:'PUT',body});onSaved()}catch(error){onError(error.message)}finally{setSaving(false)}}
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal edit-modal house-edit-modal" onSubmit={submit}><button type="button" className="modal-x" onClick={onClose}><X size={18}/></button><h3>Modifier la maison</h3><p>Modifiez la localisation, l’affectation et, si nécessaire, les fichiers.</p><Field label="Délégué associé" icon={Users}><select value={form.delegateId} onChange={e=>setForm({...form,delegateId:e.target.value})}><option value="">Sélectionner</option>{delegates.map(d=><option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}</select></Field><div className="form-grid"><Field label="Région" icon={MapPin}><input value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/></Field><Field label="Département" icon={MapPin}><input value={form.departement} onChange={e=>setForm({...form,departement:e.target.value})}/></Field><Field label="Commune" icon={MapPin}><input value={form.commune} onChange={e=>setForm({...form,commune:e.target.value})}/></Field><Field label="Quartier" icon={MapPin}><input value={form.quartier} onChange={e=>setForm({...form,quartier:e.target.value})}/></Field></div><div className="uploads"><UploadField label="Remplacer le modèle PDF" accept="application/pdf" file={form.certificate} onChange={v=>setForm({...form,certificate:v})} icon={FileText}/><UploadField label="Remplacer la signature" accept="image/png,image/jpeg" file={form.signature} onChange={v=>setForm({...form,signature:v})} icon={ImageIcon}/><UploadField label="Remplacer le cachet" accept="image/png,image/jpeg" file={form.stamp} onChange={v=>setForm({...form,stamp:v})} icon={ImageIcon}/></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" disabled={saving}>{saving?'Enregistrement…':'Enregistrer'}</button></div></form></div>
}

function DelegatesPage() {
  const [delegates, setDelegates] = useState([])
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', password:randomPassword() })
  const [errors, setErrors] = useState({})
  const [toast,setToast] = useState('')
  const [editing,setEditing]=useState(null)
  const generate = () => setForm({...form,password:randomPassword()})
  useEffect(()=>{api('/admin/delegates').then(setDelegates).catch(e=>setToast(e.message))},[])
  const editDelegate=(d)=>setEditing(d)
  const deleteDelegate=async(d)=>{if(!window.confirm(`Désactiver le compte de ${d.firstName} ${d.lastName} ? Il sera également retiré de sa maison.`))return;try{await api(`/admin/delegates/${d.id}`,{method:'DELETE'});setDelegates(list=>list.filter(item=>item.id!==d.id));setToast('Le délégué a été désactivé.')}catch(error){setToast(error.message)}}
  const submit = async (e) => {
    e.preventDefault(); const next={}
    if(!form.firstName.trim()) next.firstName='Prénom requis.'
    if(!form.lastName.trim()) next.lastName='Nom requis.'
    if(!/^\S+@\S+\.\S+$/.test(form.email)) next.email='E-mail invalide.'
    if(form.password.length<10) next.password='Mot de passe trop court.'
    setErrors(next); if(Object.keys(next).length) return
    try { const created=await api('/admin/delegates',{method:'POST',body:JSON.stringify(form)});setDelegates([created,...delegates]);setForm({firstName:'',lastName:'',email:'',password:randomPassword()});setToast('Le compte délégué a été créé.') } catch(error){setToast(error.message)}
  }
  const copyPassword = async () => { try{await navigator.clipboard.writeText(form.password);setToast('Mot de passe copié.')}catch{setToast('Mot de passe prêt à être copié.')} }
  return <AppShell><PageHeader eyebrow="Gestion des accès" title="Délégués du quartier" description="Créez et gérez les comptes des délégués qui traiteront les demandes de leur quartier."/><section className="two-panel"><form className="panel form-panel" onSubmit={submit}><div className="panel-head"><div><span>Nouveau compte</span><h3>Créer un délégué</h3></div><UserPlus size={23}/></div><div className="form-grid"><Field label="Prénom" icon={Users} error={errors.firstName}><input value={form.firstName} onChange={(e)=>setForm({...form,firstName:e.target.value})} placeholder="Prénom"/></Field><Field label="Nom" icon={Users} error={errors.lastName}><input value={form.lastName} onChange={(e)=>setForm({...form,lastName:e.target.value})} placeholder="Nom"/></Field></div><Field label="Adresse e-mail" icon={Mail} error={errors.email}><input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="prenom.nom@sunupapier.sn"/></Field><Field label="Mot de passe sécurisé" icon={LockKeyhole} error={errors.password} hint="généré automatiquement"><input value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})}/><button type="button" className="icon-button" onClick={copyPassword}><Copy size={17}/></button></Field><div className="inline-actions"><button type="button" className="secondary-button" onClick={generate}><KeyRound size={17}/> Régénérer</button><button className="primary-button"><Plus size={17}/> Créer le compte</button></div></form><article className="panel list-panel"><div className="panel-head"><div><span>Comptes existants</span><h3>{delegates.length} délégué(s)</h3></div></div><div className="record-list">{delegates.map(d=><div className="record" key={d.id}><div className="record-avatar">{d.firstName[0]}{d.lastName[0]}</div><div className="record-main"><strong>{d.firstName} {d.lastName}</strong><span>{d.email}</span><small><MapPin size={13}/>{d.quartier||'Non affecté'}</small></div><div className="record-actions"><button type="button" onClick={()=>editDelegate(d)} title="Modifier"><Pencil size={16}/></button><button type="button" className="danger" onClick={()=>deleteDelegate(d)} title="Supprimer"><Trash2 size={16}/></button></div></div>)}</div></article></section>{editing&&<DelegateEditModal delegate={editing} onClose={()=>setEditing(null)} onError={setToast} onSaved={updated=>{setDelegates(list=>list.map(item=>item.id===updated.id?{...item,...updated}:item));setEditing(null);setToast('Les informations du délégué ont été modifiées.')}}/>}{toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</AppShell>
}

function UploadField({ label, accept, file, onChange, icon:Icon=Upload }) {
  return <label className="upload-field"><input type="file" accept={accept} onChange={(e)=>onChange(e.target.files?.[0] || null)}/><span className="upload-icon"><Icon size={20}/></span><div><strong>{label}</strong><span>{file ? file.name : 'Cliquez pour importer'}</span></div><Upload size={17}/></label>
}

function HousesPage() {
  const [delegates, setDelegates] = useState([])
  const [houses,setHouses]=useState([])
  const [form,setForm]=useState({region:'Dakar',departement:'Dakar',commune:'',quartier:'',delegateId:'',certificate:null,signature:null,stamp:null})
  const [toast,setToast]=useState('')
  const [editing,setEditing]=useState(null)
  useEffect(()=>{Promise.all([api('/admin/delegates'),api('/admin/houses')]).then(([d,h])=>{setDelegates(d);setHouses(h)}).catch(e=>setToast(e.message))},[])
  const editHouse=(h)=>setEditing(h)
  const deleteHouse=async(h)=>{if(!window.confirm(`Supprimer la maison de ${h.quartier} ?`))return;try{await api(`/admin/houses/${h.id}`,{method:'DELETE'});setHouses(list=>list.filter(item=>item.id!==h.id));setToast('La maison a été supprimée.')}catch(error){setToast(error.message)}}
  const submit=async(e)=>{e.preventDefault();if(!form.commune||!form.quartier||!form.delegateId){setToast('Complétez la localisation et choisissez un délégué.');return}const body=new FormData();Object.entries(form).forEach(([k,v])=>{if(v)body.append(k,v)});try{await api('/admin/houses',{method:'POST',body});const updated=await api('/admin/houses');setHouses(updated);setForm({region:'Dakar',departement:'Dakar',commune:'',quartier:'',delegateId:'',certificate:null,signature:null,stamp:null});setToast('Maison de chef de quartier créée et délégué affecté.')}catch(error){setToast(error.message)}}
  const delegateName=(id)=>houses.find(h=>h.delegate_id===Number(id))?.delegateName||(()=>{const d=delegates.find(x=>x.id===Number(id));return d?`${d.firstName} ${d.lastName}`:'—'})()
  return <AppShell><PageHeader eyebrow="Organisation territoriale" title="Maisons de chef de quartier" description="Associez une maison à un délégué puis gérez ses informations et éléments de signature."/><section className="two-panel house-layout"><form className="panel form-panel" onSubmit={submit}><div className="panel-head"><div><span>Nouvelle maison</span><h3>Créer une maison de chef de quartier</h3></div><Building2 size={23}/></div><Field label="Délégué associé" icon={Users}><select value={form.delegateId} onChange={(e)=>setForm({...form,delegateId:e.target.value})}><option value="">Sélectionner un délégué</option>{delegates.map(d=><option value={d.id} key={d.id}>{d.firstName} {d.lastName}</option>)}</select></Field><div className="form-grid"><Field label="Région" icon={MapPin}><input value={form.region} onChange={(e)=>setForm({...form,region:e.target.value})}/></Field><Field label="Département" icon={MapPin}><input value={form.departement} onChange={(e)=>setForm({...form,departement:e.target.value})}/></Field><Field label="Commune" icon={MapPin}><input value={form.commune} onChange={(e)=>setForm({...form,commune:e.target.value})} placeholder="Ex. Grand Yoff"/></Field><Field label="Quartier" icon={MapPin}><input value={form.quartier} onChange={(e)=>setForm({...form,quartier:e.target.value})} placeholder="Ex. Grand-Yoff"/></Field></div><div className="uploads"><UploadField label="Modèle certificat de domicile" accept="application/pdf" file={form.certificate} onChange={(v)=>setForm({...form,certificate:v})} icon={FileText}/><UploadField label="Signature" accept="image/png,image/jpeg" file={form.signature} onChange={(v)=>setForm({...form,signature:v})} icon={ImageIcon}/><UploadField label="Cachet" accept="image/png,image/jpeg" file={form.stamp} onChange={(v)=>setForm({...form,stamp:v})} icon={ImageIcon}/></div><button className="primary-button"><Plus size={18}/> Créer la maison</button></form><article className="panel list-panel"><div className="panel-head"><div><span>Maisons configurées</span><h3>{houses.length} maison(s)</h3></div></div><div className="record-list">{houses.map(h=><div className="house-record" key={h.id}><div className="house-title"><span className="record-avatar"><Home size={18}/></span><div><strong>{h.quartier}</strong><span>{h.commune} · {h.departement}</span></div><div className="record-actions house-actions"><button type="button" onClick={()=>editHouse(h)} title="Modifier"><Pencil size={16}/></button><button type="button" className="danger" onClick={()=>deleteHouse(h)} title="Supprimer"><Trash2 size={16}/></button></div></div><div className="house-meta"><span><Users size={14}/>{h.delegateName||'Aucun délégué'}</span><span><FileText size={14}/>{h.certificate_path||'Aucun modèle'}</span></div></div>)}</div></article></section>{editing&&<HouseEditModal house={editing} delegates={delegates} onClose={()=>setEditing(null)} onError={setToast} onSaved={async()=>{setHouses(await api('/admin/houses'));setEditing(null);setToast('La maison a été modifiée.')}}/>}{toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</AppShell>
}

function DocumentsPage(){return <AppShell><PageHeader eyebrow="Catalogue" title="Documents administratifs" description="Gérez les types de documents proposés aux citoyens."/><article className="document-card"><div className="document-icon"><FileCheck2 size={28}/></div><div className="document-info"><span className="status active">Actif</span><h3>Certificat de domicile</h3><p>Document disponible pour les citoyens. Le modèle, la signature et le cachet sont configurés au niveau de chaque maison de chef de quartier.</p><div className="document-stats"><span><ClipboardList size={16}/>37 demandes</span><span><Home size={16}/>2 quartiers configurés</span></div></div><button className="secondary-button">Configurer <ChevronRight size={17}/></button></article></AppShell>}

function Protected({ children }) { return isLoggedIn() ? children : <Navigate to="/connexion" replace/> }

export default function App(){return <Routes><Route path="/connexion" element={<LoginPage/>}/><Route path="/dashboard" element={<Protected><DashboardPage/></Protected>}/><Route path="/delegues" element={<Protected><DelegatesPage/></Protected>}/><Route path="/maisons" element={<Protected><HousesPage/></Protected>}/><Route path="/documents" element={<Protected><DocumentsPage/></Protected>}/><Route path="*" element={<Navigate to={isLoggedIn()?'/dashboard':'/connexion'} replace/>}/></Routes>}
