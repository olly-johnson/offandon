import type {
  FormulaDimension,
  FormulaMatrix,
  FormulaSource,
  HookExemplar,
} from "@/lib/shared/formula-matrix";

/**
 * The Formula Matrix card. Reads the matrix built from the creator's own
 * analysed library plus their tracked competitors and shows, in one place:
 * the winning format, the winning topic, the winning hook, and the single
 * suggested video that combines all three.
 */
export function FormulaMatrixCard({ matrix }: { matrix: FormulaMatrix }) {
  if (matrix.sampleSize === 0) {
    return (
      <div className="oo-card-static bd-section p-6">
        <div className="bd-card-title">The Formula Matrix</div>
        <p style={{ color: "var(--oo-text-dim)", fontSize: 13, lineHeight: 1.7 }}>
          Not enough data to build the formula matrix yet. Analyse a few of your
          own videos on the{" "}
          <span style={{ color: "var(--oo-gold)" }}>Library</span> page and track
          competitors in the{" "}
          <span style={{ color: "var(--oo-gold)" }}>Research</span> section. Once
          their reels are analysed, the winning format, topic, and hook show up
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="oo-card-static bd-section p-6">
      <div className="bd-card-title">The Formula Matrix</div>
      <p style={{ color: "var(--oo-text-dim)", fontSize: 13, marginBottom: 18 }}>
        The combination working best across your content and the competitors you
        track. Built from {matrix.sampleSize} analysed{" "}
        {matrix.sampleSize === 1 ? "post" : "posts"}.
      </p>

      {matrix.formula ? (
        <div
          className="mb-6 rounded-lg p-5"
          style={{
            background: "var(--oo-bg-hover)",
            border: "1px solid var(--oo-border)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--oo-gold)",
              marginBottom: 12,
            }}
          >
            Your next video formula
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <FormulaChip label="Format" value={matrix.formula.format} />
            <FormulaChip label="Topic" value={matrix.formula.topic} />
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--oo-text-primary)",
              fontStyle: "italic",
              borderLeft: "2px solid var(--oo-gold)",
              paddingLeft: 12,
              marginBottom: 12,
            }}
          >
            &ldquo;{matrix.formula.hook}&rdquo;
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--oo-text-secondary)" }}>
            {matrix.formula.rationale}
          </p>
        </div>
      ) : (
        <p
          style={{
            color: "var(--oo-text-dim)",
            fontSize: 13,
            lineHeight: 1.7,
            marginBottom: 18,
          }}
        >
          Keep analysing content to complete the combined formula. It needs at
          least one analysed video that carries a format, a matched pillar, and a
          readable hook.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <DimensionList title="Formats that work" rows={matrix.formats} />
        <DimensionList title="Topics that work" rows={matrix.topics} />
        <HookList hooks={matrix.hooks} />
      </div>
    </div>
  );
}

function FormulaChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 rounded-md px-3 py-1.5"
      style={{ background: "var(--oo-bg)", border: "1px solid var(--oo-border)" }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--oo-text-dim)",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--oo-text-primary)" }}>
        {value}
      </span>
    </span>
  );
}

function sourceLabel(sources: FormulaSource[]): string {
  const hasOwn = sources.includes("own");
  const hasComp = sources.includes("competitor");
  if (hasOwn && hasComp) return "You + competitors";
  if (hasComp) return "Competitors";
  return "You";
}

function DimensionList({ title, rows }: { title: string; rows: FormulaDimension[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--oo-text-dim)",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <p style={{ color: "var(--oo-text-dim)", fontSize: 12.5 }}>No signal yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.slice(0, 4).map((r) => (
            <div key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span
                  className="truncate"
                  style={{ fontSize: 13, color: "var(--oo-text-primary)" }}
                  title={r.label}
                >
                  {r.label}
                </span>
                <span
                  className="tabular-nums"
                  style={{ fontSize: 12, color: "var(--oo-text-secondary)" }}
                >
                  {r.score}
                </span>
              </div>
              <div
                className="relative h-1.5 w-full rounded"
                style={{ background: "var(--oo-bg-hover)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${r.score}%`, background: "var(--oo-gold)", minWidth: 2 }}
                />
              </div>
              <div style={{ fontSize: 10.5, color: "var(--oo-text-dim)", marginTop: 3 }}>
                {sourceLabel(r.sources)} · {r.sampleSize}{" "}
                {r.sampleSize === 1 ? "post" : "posts"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HookList({ hooks }: { hooks: HookExemplar[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--oo-text-dim)",
          marginBottom: 12,
        }}
      >
        Hooks that work
      </div>
      {hooks.length === 0 ? (
        <p style={{ color: "var(--oo-text-dim)", fontSize: 12.5 }}>No hooks read yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {hooks.map((h, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: "var(--oo-text-secondary)",
                }}
              >
                &ldquo;{h.hook}&rdquo;
              </div>
              <div style={{ fontSize: 10.5, color: "var(--oo-text-dim)", marginTop: 3 }}>
                {h.source === "competitor" && h.competitorUsername
                  ? `@${h.competitorUsername}`
                  : "You"}{" "}
                · score {h.score}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
