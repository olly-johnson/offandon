/**
 * Smaller side cards that appear in the two 2-up grids on the brand
 * dashboard. None of these have real data wired up yet; they intentionally
 * show the same "not enough data" placeholders as the reference mockup so
 * the layout is in place when future tickets fill them in.
 */

export function FormulaMatrixCard() {
  return (
    <div className="oo-card-static bd-section p-6">
      <div className="bd-card-title">The Formula Matrix</div>
      <p style={{ color: "var(--oo-text-dim)", fontSize: 13 }}>
        Not enough data to build the formula matrix yet.
      </p>
    </div>
  );
}

export function StoryBankCard() {
  return (
    <div className="oo-card-static p-6">
      <div className="bd-card-title">Story Bank</div>
      <p style={{ color: "var(--oo-text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
        Story usage tracking is coming soon. It will show how many of your story
        bank stories appear across your scripts, and which one performs best.
        Seed your stories in onboarding or the Brand section so they are ready
        when this goes live.
      </p>
    </div>
  );
}

export function IdentityDepthCard() {
  return (
    <div className="oo-card-static p-6">
      <div className="bd-card-title">Identity Depth</div>
      <p style={{ color: "var(--oo-text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
        Requires video transcription to measure accurately. Once enabled, this
        score measures how much of your personal story, specific language, real
        experiences, philosophy, and unique angles show up in your actual
        videos. The higher the score, the less you blend into noise. Enable by
        running SupaData transcription on your posted videos.
      </p>
    </div>
  );
}

export function CompetitorsCard() {
  return (
    <div className="oo-card-static p-6">
      <div className="bd-card-title">Competitors</div>
      <p style={{ color: "var(--oo-text-dim)", fontSize: 13, lineHeight: 1.7 }}>
        No competitors added yet. Add competitors in the{" "}
        <span style={{ color: "var(--oo-gold)" }}>Research</span> section to
        start tracking them here.
      </p>
    </div>
  );
}
