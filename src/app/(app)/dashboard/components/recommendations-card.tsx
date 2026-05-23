import type { DashboardSuggestion } from "../data";

export function RecommendationsCard({ suggestions }: { suggestions: DashboardSuggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <div className="oo-card-static p-6">
        <div className="bd-card-title">Recommendations</div>
        <p style={{ color: "var(--oo-text-dim)", fontSize: 13 }}>
          Generate your first batch to unlock personalised recommendations.
        </p>
      </div>
    );
  }
  return (
    <div className="oo-card-static p-6">
      <div className="bd-card-title">Recommendations</div>
      <div>
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="py-3.5"
            style={{
              borderBottom:
                i < suggestions.length - 1
                  ? "1px solid var(--oo-border-subtle)"
                  : "none",
              fontSize: 13,
              lineHeight: 1.75,
              color: "var(--oo-text-secondary)",
            }}
          >
            {s.text}
          </div>
        ))}
      </div>
    </div>
  );
}
