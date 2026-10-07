import { createClient, SupabaseClient } from "@supabase/supabase-js";

let clientOverride: any = null;
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (clientOverride !== null) {
    return clientOverride;
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseInstance;
}

export function setSupabaseClient(client: any): void {
  clientOverride = client;
}

export function resetSupabaseClient(): void {
  clientOverride = null;
  supabaseInstance = null;
}
