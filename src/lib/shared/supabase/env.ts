/**
 * Single read point for Supabase env vars. Keeps the missing-var error
 * message uniform regardless of which module is the first consumer.
 *
 * IMPORTANT: NEXT_PUBLIC_* env vars must be referenced as literal
 * `process.env.NEXT_PUBLIC_FOO` for Next.js's build-time inliner to
 * substitute them into the client bundle. Reading via a dynamic helper
 * (e.g. `process.env[name]`) skips the inliner and leaves the bundle
 * with `undefined`, breaking the moment a browser-side module calls in.
 * Do not refactor these reads behind a `required(name)` wrapper.
 */

function nonEmpty(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing env var: ${name}. Set it in .env.local (see .env.example).`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return nonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}
