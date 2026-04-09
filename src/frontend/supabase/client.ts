import { createBrowserClient } from '@supabase/ssr'
import { parsePublicSupabaseEnv } from '@/src/backend/platform/env'

export function createSupabaseBrowserClient() {
  const publicSupabaseEnv = parsePublicSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })

  return createBrowserClient(
    publicSupabaseEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicSupabaseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
