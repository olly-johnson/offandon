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
      <div className="bd-serif" style={{ fontSize: 22, color: "var(--oo-text-primary)" }}>
        0{" "}
        <span style={{ fontSize: 13, color: "var(--oo-text-dim)", fontWeight: 400 }}>
          of 0 stories used
        </span>
      </div>
      <div className="bd-progress-track">
        <div className="bd-progress-fill" style={{ width: "0%" }} />
      </div>
      <p
        className="mt-3"
        style={{ fontSize: 12, color: "var(--oo-text-dim)", lineHeight: 1.6 }}
      >
        Best performing:{" "}
        <strong style={{ color: "var(--oo-text-secondary)" }}>
          Story tracking starts when scripts include ABS codes
        </strong>
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
      <p style={{ color: "var(--oo-text-dim)", fontSize: 13 }}>
        No competitors added. Use{" "}
        <code
          style={{
            background: "var(--oo-bg-hover)",
            padding: "1px 6px",
            borderRadius: 4,
            fontSize: 11,
            color: "var(--oo-gold)",
          }}
        >
          /watchlist add @handle
        </code>{" "}
        to start tracking.
      </p>
    </div>
  );
}
