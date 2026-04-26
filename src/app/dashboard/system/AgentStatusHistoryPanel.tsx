import type { AgentStatus, AgentStatusHistoryPoint } from "@/lib/agent-status";
import { DashboardCard, DashboardCardTitle } from "../components";
import { formatEasternTime } from "@/lib/time";

const AGENT_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#14b8a6"];

function clampPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function buildHourlyBuckets(points: AgentStatusHistoryPoint[], hours = 24) {
  const now = Date.now();
  const bucketMs = 60 * 60 * 1000;
  const buckets = Array.from({ length: hours }, (_, index) => {
    const start = now - (hours - 1 - index) * bucketMs;
    return { start, end: start + bucketMs, label: new Date(start).toISOString() };
  });

  return buckets.map((bucket) => {
    const matches = points.filter((point) => {
      const ts = Date.parse(point.capturedAt);
      return Number.isFinite(ts) && ts >= bucket.start && ts < bucket.end;
    });
    const latest = matches.at(-1);
    return {
      label: bucket.label,
      value: clampPercent(latest?.realCtxUsage),
      capturedAt: latest?.capturedAt,
    };
  });
}

function buildPolyline(values: Array<number | null>, width: number, height: number, padding: number) {
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const denominator = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      if (value == null) return null;
      const x = padding + (usableWidth * index) / denominator;
      const y = padding + usableHeight - (usableHeight * value) / 100;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");
}

function latestSeenAt(points: AgentStatusHistoryPoint[]) {
  const latest = points.at(-1)?.capturedAt;
  return latest ? formatEasternTime(latest) : "暂无历史";
}

function historyTone(value: number | undefined) {
  if ((value || 0) >= 85) return "text-rose-700";
  if ((value || 0) >= 70) return "text-amber-700";
  return "text-slate-700";
}

export function AgentStatusHistoryPanel({
  statuses,
  history,
}: {
  statuses: AgentStatus[];
  history: Record<string, AgentStatusHistoryPoint[]>;
}) {
  const visibleAgents = statuses
    .slice()
    .sort((a, b) => String(a.agent).localeCompare(String(b.agent), "zh-CN"))
    .map((item, index) => ({
      status: item,
      color: AGENT_COLORS[index % AGENT_COLORS.length],
      points: history[item.agent] || [],
    }));

  return (
    <DashboardCard>
      <DashboardCardTitle
        title="CTX 趋势 / 过去 24 小时"
        desc="现在会把 agent status 心跳快照按代理持久化，方便看上下文膨胀、假在线、和长时间卡住前后的变化。"
        right={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{visibleAgents.length} 个 Agent</span>}
      />
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {visibleAgents.length > 0 ? visibleAgents.map(({ status, color, points }) => {
          const buckets = buildHourlyBuckets(points, 24);
          const values = buckets.map((item) => item.value);
          const polyline = buildPolyline(values, 420, 132, 12);
          const currentUsage = clampPercent(status.realCtxUsage);
          const peakUsage = values.reduce<number | null>((max, value) => value == null ? max : max == null ? value : Math.max(max, value), null);
          return (
            <div key={status.agent} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{status.agent}{status.role ? ` / ${status.role}` : ""}</p>
                  <p className="mt-1 text-[11px] text-slate-500">最近采样：{latestSeenAt(points)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-white ${historyTone(currentUsage || undefined)}`}>
                    当前 {currentUsage ?? "-"}%
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    峰值 {peakUsage ?? "-"}%
                  </span>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
                <svg viewBox="0 0 420 132" className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label={`${status.agent} context history`}>
                  {[25, 50, 75].map((mark) => {
                    const y = 12 + (108 * (100 - mark)) / 100;
                    return <line key={mark} x1="12" x2="408" y1={y} y2={y} stroke={mark >= 75 ? "#fecaca" : "#e2e8f0"} strokeDasharray="4 4" strokeWidth="1" />;
                  })}
                  {polyline ? <polyline fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={polyline} /> : null}
                  {buckets.map((item, index) => {
                    if (item.value == null) return null;
                    const x = 12 + (396 * index) / Math.max(1, buckets.length - 1);
                    const y = 12 + 108 - (108 * item.value) / 100;
                    const danger = item.value >= 75;
                    return <circle key={`${status.agent}-${item.label}`} cx={x} cy={y} r={danger ? 3.6 : 2.3} fill={danger ? "#ef4444" : color} />;
                  })}
                </svg>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span>24h 前</span>
                  <span>红点 = 高压区（≥75%）</span>
                  <span>现在</span>
                </div>
              </div>
            </div>
          );
        }) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">当前还没有 agent status 历史。</div>}
      </div>
    </DashboardCard>
  );
}
