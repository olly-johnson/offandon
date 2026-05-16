/**
 * Weekly check-in engine types (BO-057..BO-060).
 *
 * Domain shape is deliberately small. The Friday cron resolves Recipients
 * from `auth.users` + `profiles`; the webhook persists CheckinRows; the
 * voice-DNA-refresh function reads back the latest CheckinRows to fold
 * into the regenerated Voice DNA.
 */

export interface Recipient {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface WeeklyCheckinRow {
  id: string;
  userId: string;
  weekStart: string;
  rawResponses: Record<string, unknown>;
  submittedAt: string;
}
