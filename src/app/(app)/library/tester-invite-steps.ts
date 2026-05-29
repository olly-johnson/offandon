/**
 * Step-by-step a beta client follows to accept their Instagram Tester
 * invite.
 *
 * Why this exists: while the Meta app is in Development mode, the
 * Instagram OAuth consent screen rejects any account that has not been
 * added as a Tester AND accepted the invite, surfacing the error
 * "Insufficient Developer role". Clients are invited via the Meta
 * dashboard but routinely miss the acceptance step, which happens on
 * Instagram's own site, not in Bot OS. These steps point them there.
 *
 * Remove this helper (and its render in the Connect empty state) once the
 * app passes App Review and goes Live, since the tester gate disappears.
 */

/** The Instagram page that lists pending tester invites to accept. */
export const INSTAGRAM_MANAGE_ACCESS_URL =
  "https://www.instagram.com/accounts/manage_access/";

export interface TesterInviteStep {
  /** 1-based position, used for the visible step number. */
  n: number;
  /** Short imperative instruction. No em-dashes (Bot OS copy rule). */
  text: string;
}

export const TESTER_INVITE_STEPS: readonly TesterInviteStep[] = [
  {
    n: 1,
    text: "Make sure you are logged in to the Instagram account you want to connect.",
  },
  {
    n: 2,
    text: "Open instagram.com/accounts/manage_access and select the Tester Invites tab.",
  },
  {
    n: 3,
    text: "Find the Off&On invite and tap Accept.",
  },
  {
    n: 4,
    text: "Then click Connect with Instagram below.",
  },
];
