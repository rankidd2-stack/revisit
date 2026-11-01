import { TrendingDown, TrendingUp } from "lucide-react";

interface Props {
  label: string;
  value: string;
  detail: string;
  change: number;           // vs the comparison period, in the same unit as the detail
  changeLabel: string;      // "vs October"
  series: number[];         // oldest first, for the sparkline
  sample?: boolean;         // demo numbers: say so on the card itself
}

/** The money number. Owners renew because of it, so it leads the home view. */
export function MetricCard({ label, value, detail, change, changeLabel, series, sample = false }: Props) {
  const max = Math.max(...series, 1);
  const pts = series.map((v, i) => `${(i / Math.max(series.length - 1, 1)) * 120},${36 - (v / max) * 32}`).join(" ");
  const up = change >= 0;
  return (
    <section className="card metric-card" aria-label={label}>
      <div className="metric-top">
        <div className="metric-label">
          <p className="label muted">{label}</p>
          {sample ? <span className="pill pill-scheduled caption">Sample numbers</span> : null}
        </div>
        <svg className="spark" viewBox="0 0 120 40" role="img" aria-label={`Trend over the last ${series.length} months`}>
          <polyline points={pts} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <p className="metric-xl">{value}</p>
      <p className="body metric-detail">
        <span>{detail}</span>
        <span className={`change ${up ? "change-up" : "change-down"} label`}>
          {up ? <TrendingUp size={16} strokeWidth={1.5} aria-hidden /> : <TrendingDown size={16} strokeWidth={1.5} aria-hidden />}
          {up ? "+" : ""}{change} {changeLabel}
        </span>
      </p>
    </section>
  );
}
