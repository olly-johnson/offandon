/**
 * Admin role check.
 *
 * Promotion happens directly in the auth schema (one-off SQL run via the
 * Supabase SQL editor):
 *
 *   update auth.users
 *      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
 *                              || '{"is_admin": true}'::jsonb
 *    where email = 'olly@example.com';
 *
 * `app_metadata` (vs `user_metadata`) is the right home because users
 * cannot mutate it via the client SDK; only the service role can. That
 * matters here because the JWT echoes `app_metadata` straight into the
 * `auth.users` row Supabase returns from `getUser()`.
 */
export interface AdminCheckUser {
  id: string;
  app_metadata?: Record<string, unknown> | null;
}

export function isAdmin(user: AdminCheckUser | null | undefined): boolean {
  if (!user) return false;
  return user.app_metadata?.is_admin === true;
}
