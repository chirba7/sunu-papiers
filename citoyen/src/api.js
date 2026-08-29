const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const SERVER_URL = API_URL.replace(/\/api\/?$/, '')
const TOKEN_KEY = 'sunu_citizen_token'
const REFRESH_KEY = 'sunu_citizen_refresh_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const isLoggedIn = () => Boolean(getToken())
export const logout = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY) }
async function refreshSession(){const refreshToken=localStorage.getItem(REFRESH_KEY);if(!refreshToken)return false;const response=await fetch(`${API_URL}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken})});if(!response.ok)return false;const data=await response.json();localStorage.setItem(TOKEN_KEY,data.token);localStorage.setItem(REFRESH_KEY,data.refreshToken);return true}
export async function api(path,options={},retried=false){const headers=new Headers(options.headers);if(!(options.body instanceof FormData))headers.set('Content-Type','application/json');if(getToken())headers.set('Authorization',`Bearer ${getToken()}`);const response=await fetch(`${API_URL}${path}`,{...options,headers});if(response.status===401&&!retried&&await refreshSession())return api(path,options,true);const data=await response.json().catch(()=>({}));if(!response.ok){if(response.status===401){logout();window.location.replace('/connexion')}throw new Error(data.error||'Le serveur est indisponible.')}return data}
const saveSession=data=>{localStorage.setItem(TOKEN_KEY,data.token);if(data.refreshToken)localStorage.setItem(REFRESH_KEY,data.refreshToken)}
export async function login(phone,pin){const data=await api('/auth/login',{method:'POST',body:JSON.stringify({phone,pin,role:'citizen'})});saveSession(data);return data}
export async function register(payload){const data=await api('/auth/citizen/register',{method:'POST',body:JSON.stringify(payload)});saveSession(data);return data}
export const uploadUrl = (filename) => filename ? `${SERVER_URL}/uploads/${filename}?token=${encodeURIComponent(getToken())}` : ''
