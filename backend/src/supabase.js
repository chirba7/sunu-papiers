import { createClient } from '@supabase/supabase-js'

const url=process.env.SUPABASE_URL
const anonKey=process.env.SUPABASE_ANON_KEY
const serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY
export const isSupabaseConfigured=Boolean(url&&anonKey&&serviceRoleKey)
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
export const supabasePublic=isSupabaseConfigured?createClient(url,anonKey,options):null
export const supabaseAdmin=isSupabaseConfigured?createClient(url,serviceRoleKey,options):null

export function requireSupabaseConfig(){
  const missing=[]
  if(!url)missing.push('SUPABASE_URL')
  if(!anonKey)missing.push('SUPABASE_ANON_KEY')
  if(!serviceRoleKey)missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if(missing.length)throw new Error(`Variables Supabase manquantes : ${missing.join(', ')}`)
  return {url,anonKey,serviceRoleKey}
}
