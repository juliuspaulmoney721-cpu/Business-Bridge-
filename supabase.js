import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://qydwvspemujwizsrtxla.supabase.co'

const supabaseKey = 'sb_publishable_3oaFbXriLxj3_PZ7nJfdYA_ppQmaMjM'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
