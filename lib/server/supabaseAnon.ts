import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicAnonKey, getSupabasePublicUrl } from "@/lib/supabase/publicConfig";

/** Anon-клиент на сервере — обход блокировок браузера к *.supabase.co. */
export function getSupabaseAnonServer(): SupabaseClient {
  const url = getSupabasePublicUrl();
  const key = getSupabasePublicAnonKey();
  if (!url || !key) {
    throw new Error(
      "[supabase] Задайте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local.",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
