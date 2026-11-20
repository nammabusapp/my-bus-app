import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL as string | undefined
)?.trim();
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim();

function createSafeBrowserSupabaseClient(
  url?: string,
  key?: string
): SupabaseClient | null {
  if (
    !url ||
    !key ||
    url.includes('your-project-ref') ||
    url.includes('MY_') ||
    key.includes('your-supabase') ||
    key.includes('MY_')
  ) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return createClient(url, key, {
      realtime: {
        params: {
          eventsPerSecond: 5,
        },
      },
    });
  } catch {
    return null;
  }
}

export const supabase: SupabaseClient | null = createSafeBrowserSupabaseClient(
  supabaseUrl,
  supabaseAnonKey
);

export const isSupabaseClientConfigured = supabase !== null;
