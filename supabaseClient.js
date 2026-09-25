import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Replace these two with your actual values from
// Project Settings -> Configuration -> API Keys
const SUPABASE_URL = 'https://vekpdmgjhodjugscraaq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rjR9HsubvdS2CcFFzDxDyg_YVTi7o9S'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
