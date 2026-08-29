const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const TOKEN_KEY = 'sunu_admin_token'

export const getToken = () => sessionStorage.getItem(TOKEN_KEY)
export const isLoggedIn = () => Boolean(getToken())
export const logout = () => sessionStorage.removeItem(TOKEN_KEY)

export async function api(path, options = {}) {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (getToken()) headers.set('Authorization', `Bearer ${getToken()}`)
  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Le serveur est indisponible.')
  return data
}

export async function login(email, password) {
  const data = await api('/auth/login', { method:'POST', body:JSON.stringify({ email, password, role:'admin' }) })
  sessionStorage.setItem(TOKEN_KEY, data.token)
  return data
}
