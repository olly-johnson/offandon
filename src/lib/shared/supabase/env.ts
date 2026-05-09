/**
 * Single read point for Supabase env vars. Keeps the missing-var error
 * message uniform regardless of which module is the first consumer.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing env var: ${name}. Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}
