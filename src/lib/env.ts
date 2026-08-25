export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * True as soon as a Supabase project is reachable — used to decide whether
 * data reads/writes can target Postgres. This is deliberately separate from
 * auth mode (see isSupabaseAuthEnabled below): a project can be connected
 * for data before any real accounts exist for people to sign in with.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * V0.1 must be demoable with zero cloud setup, and must keep working with
 * demo accounts even after a Supabase project is connected, until real
 * accounts actually exist for the admin and each monitor — otherwise
 * configuring Supabase for data would silently lock everyone out of login.
 * This is a separate, explicit opt-in: set NEXT_PUBLIC_SUPABASE_AUTH_ENABLED
 * to "true" only once those real accounts have been created.
 */
export const isSupabaseAuthEnabled = isSupabaseConfigured && process.env.NEXT_PUBLIC_SUPABASE_AUTH_ENABLED === "true";
