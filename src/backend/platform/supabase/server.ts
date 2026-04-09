import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicSupabaseEnv } from '@/src/backend/platform/env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    publicSupabaseEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicSupabaseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )
}
