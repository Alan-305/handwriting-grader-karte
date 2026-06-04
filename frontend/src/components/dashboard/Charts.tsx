import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import type { AggregatedStats } from "@/types/firestore";
import { categorizeErrorTag, errorCategorySeverityIndex, normalizeErrorTagLabel } from "@/lib/error-tag-label";

export function ScoreTrendChart({ stats }: { stats: AggregatedStats | null }) {
  if (!stats?.scoreHistory?.length) {
    return <p className="font-ja text-sm text-slate-500">セッションデータがありません</p>;
  }

  const data = stats.scoreHistory.map((s, i) => ({
    name: `${i + 1}回目`,
    score: s.totalScore,
    max: s.maxScore,
    rate: s.maxScore ? Math.round((s.totalScore / s.maxScore) * 100) : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
        <Tooltip />
        <Line type="monotone" dataKey="rate" stroke="#1e40af" strokeWidth={2} dot={{ r: 4 }} name="正答率" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 第1回→最新回。下に行くほど新しいテスト */
const SESSION_BAR_COLORS = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#4f46e5",
  "#be185d",
] as const;

type ErrorRow = { name: string; count: number };

function tagsToRows(tags: Array<{ tag: string; count: number }>): ErrorRow[] {
  const map = new Map<string, number>();
  for (const { tag, count } of tags) {
    const cat = categorizeErrorTag(tag);
    map.set(cat, (map.get(cat) ?? 0) + count);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(
      (a, b) =>
        errorCategorySeverityIndex(a.name) - errorCategorySeverityIndex(b.name) ||
        b.count - a.count,
    );
}

function ErrorTagYAxisTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const label = normalizeErrorTagLabel(payload?.value ?? "");
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#334155" fontSize={12} className="font-ja">
      {label}
    </text>
  );
}

function SessionErrorBlock({
  order,
  rows,
  fill,
}: {
  order: number;
  rows: ErrorRow[];
  fill: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3">
        <p className="font-ja text-sm font-semibold text-slate-700">第{order}回</p>
        <p className="mt-1 font-ja text-xs text-slate-500">記録されたミス傾向はありません</p>
      </div>
    );
  }

  const maxLabelLen = Math.max(...rows.map((d) => d.name.length), 4);
  const yAxisWidth = Math.min(320, 24 + maxLabelLen * 14);
  const chartHeight = Math.max(120, rows.length * 32 + 40);
  const chartMinWidth = yAxisWidth + 100;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 font-ja text-sm font-semibold text-slate-800">
        <span className="mr-2 inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: fill }} aria-hidden />
        第{order}回
      </p>
      <div className="overflow-x-auto">
        <div style={{ minWidth: chartMinWidth, width: "100%" }}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={yAxisWidth}
                interval={0}
                tick={<ErrorTagYAxisTick />}
              />
              <Tooltip
                labelFormatter={(value) => normalizeErrorTagLabel(String(value))}
                formatter={(value) => [`${value ?? 0} 件`, `第${order}回`]}
              />
              <Bar dataKey="count" name={`第${order}回`} fill={fill} radius={[0, 4, 4, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function ErrorFrequencyChart({ stats }: { stats: AggregatedStats | null }) {
  if (!stats) {
    return <p className="font-ja text-sm text-slate-500">エラーデータがありません</p>;
  }

  const sessions = stats.errorTagsBySession ?? [];
  const hasPerSession = sessions.length > 0;

  const blocks = hasPerSession
    ? sessions.map((sess, idx) => ({
        order: sess.order,
        rows: tagsToRows(sess.tags),
        fill: SESSION_BAR_COLORS[idx % SESSION_BAR_COLORS.length],
      }))
    : stats.topErrorTags?.length
      ? [
          {
            order: 1,
            rows: tagsToRows(stats.topErrorTags),
            fill: SESSION_BAR_COLORS[0],
          },
        ]
      : [];

  if (!blocks.length) {
    return <p className="font-ja text-sm text-slate-500">エラーデータがありません</p>;
  }

  const testCount = stats.totalSessions ?? sessions.length ?? blocks.length;

  return (
    <div className="w-full space-y-3 overflow-visible">
      <p className="font-ja text-center text-xs text-slate-500">
        上から第1回、下に向かって第2回・第3回…と並びます（全{testCount}回・同一テストの再添削は上書き）。各回の棒は上ほど重大なミス傾向です。
      </p>
      {!hasPerSession && (
        <p className="font-ja text-center text-xs text-amber-700">
          テスト別の内訳を表示するには、カルテを開き直すか AI 分析を実行してください。
        </p>
      )}
      <div className="flex flex-col gap-5">
        {blocks.map((block) => (
          <SessionErrorBlock
            key={block.order}
            order={block.order}
            rows={block.rows}
            fill={block.fill}
          />
        ))}
      </div>
    </div>
  );
}
