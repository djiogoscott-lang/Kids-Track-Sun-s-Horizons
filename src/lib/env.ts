export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * V0.1 must be demoable with zero cloud setup. When no Supabase project is
 * configured, the app falls back to an in-memory demo dataset and a
 * cookie-based demo session instead of real Supabase Auth. Configuring both
 * env vars switches the whole app back to real Supabase Auth + Postgres.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
