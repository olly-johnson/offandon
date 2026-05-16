export type { EmailMessage, EmailSendResult, IEmailClient } from "./client";
export {
  DryRunEmailClient,
  ResendEmailClient,
  getEmailClient,
} from "./resend";
export {
  buildWeeklyReminderEmail,
  buildWeeklySendEmail,
  type WeeklyEmailContext,
} from "./templates";
