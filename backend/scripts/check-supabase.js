import 'dotenv/config'
import { requireSupabaseConfig, supabaseAdmin } from '../src/supabase.js'

try{
  const{url}=requireSupabaseConfig()
  const{count,error}=await supabaseAdmin.from('profiles').select('*',{count:'exact',head:true})
  if(error)throw error
  console.log(`Connexion Supabase réussie : ${url}`)
  console.log(`Table profiles accessible (${count??0} ligne(s)).`)
}catch(error){console.error(error.message);process.exitCode=1}
