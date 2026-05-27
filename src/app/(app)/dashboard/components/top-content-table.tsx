import type { TopContentRow } from "@/lib/shared/dashboard-metrics";

function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString();
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "-";
  return `${n.toFixed(1)}%`;
}

function fmtMult(n: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `${n.toFixed(1)}x`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

export function TopContentTable({ rows }: { rows: TopContentRow[] }) {
  if (rows.length === 0) {
    return (
      <p style={{ color: "var(--oo-text-dim)", fontSize: 13 }}>
        No posts in the last 30 days yet.
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="bd-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Post</th>
            <th className="bd-num">Eng %</th>
            <th className="bd-num">Outlier</th>
            <th className="bd-num">Views</th>
            <th className="bd-num">Likes</th>
            <th className="bd-num">Saves</th>
            <th className="bd-num">Shares</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const highOutlier =
              r.outlierMultiplier !== null && r.outlierMultiplier >= 3;
            return (
              <tr key={r.id}>
                <td className="bd-rank">{i + 1}</td>
                <td>
                  {r.permalink ? (
                    <a href={r.permalink} target="_blank" rel="noopener noreferrer">
                      {truncate(r.caption, 60)}
                    </a>
                  ) : (
                    truncate(r.caption, 60)
                  )}
                  {highOutlier ? (
                    <span className="bd-outlier-badge">{fmtMult(r.outlierMultiplier)}</span>
                  ) : null}
                </td>
                <td className="bd-num">{fmtPct(r.engagementRate)}</td>
                <td
                  className="bd-num"
                  style={{
                    color: highOutlier ? "var(--oo-gold)" : "var(--oo-text-secondary)",
                    fontWeight: highOutlier ? 600 : 400,
                  }}
                >
                  {fmtMult(r.outlierMultiplier)}
                </td>
                <td className="bd-num">{fmtNum(r.views)}</td>
                <td className="bd-num">{fmtNum(r.likes)}</td>
                <td className="bd-num">{fmtNum(r.saves)}</td>
                <td className="bd-num">{fmtNum(r.shares)}</td>
                <td style={{ color: "var(--oo-text-dim)" }}>{fmtDate(r.postedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
