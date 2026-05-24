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

export function ErrorFrequencyChart({ stats }: { stats: AggregatedStats | null }) {
  if (!stats?.topErrorTags?.length) {
    return <p className="font-ja text-sm text-slate-500">エラーデータがありません</p>;
  }

  const data = stats.topErrorTags.map((e) => ({ name: e.tag, count: e.count }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#1e40af" radius={[0, 4, 4, 0]} name="回数" />
      </BarChart>
    </ResponsiveContainer>
  );
}
