import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { Timestamp } from "firebase/firestore";
import { PageHeader } from "@/components/layout/AppShell";
import { AdviceCardItem } from "@/components/dashboard/AdviceCard";
import { ErrorFrequencyChart, ScoreTrendChart } from "@/components/dashboard/Charts";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useViewerKarte, useViewerSessions } from "@/hooks/useViewer";

function formatDate(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "—";
  const d = ts.toDate();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function ViewerStudentDashboardPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { student, stats, snapshot } = useViewerKarte(studentId);
  const { sessions, loading: sessionsLoading } = useViewerSessions(studentId);

  return (
    <div>
      <PageHeader
        title={`${student?.name ?? ""} のカルテ`}
        description="成績推移・弱点分析・志望校対策アドバイス"
      />
      <div className="page-content mx-auto max-w-4xl space-y-6">
        <Button variant="outline" asChild>
          <Link to="/viewer">
            <ArrowLeft className="h-4 w-4" />
            一覧に戻る
          </Link>
        </Button>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>得点推移</CardTitle>
              <CardDescription>テストごとの正答率の推移です。</CardDescription>
            </CardHeader>
            <ScoreTrendChart stats={stats} />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ミス傾向</CardTitle>
              <CardDescription>
                テストごとに、一般カテゴリのミス傾向が積み上がります。
              </CardDescription>
            </CardHeader>
            <ErrorFrequencyChart stats={stats} />
          </Card>
        </div>

        {snapshot && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>よくやりがちなミスの癖</CardTitle>
              </CardHeader>
              <p className="font-ja leading-relaxed text-slate-700">{snapshot.weaknessSummary}</p>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>志望校合格に向けて</CardTitle>
              </CardHeader>
              <p className="font-ja leading-relaxed text-slate-700">{snapshot.readinessComment}</p>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              {snapshot.adviceCards?.map((card, i) => (
                <AdviceCardItem key={i} card={card} />
              ))}
            </div>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>添削結果（テストごと）</CardTitle>
            <CardDescription>各回の講評・解説・模範解答を閲覧できます。</CardDescription>
          </CardHeader>
          {sessionsLoading ? (
            <p className="px-6 pb-6 font-ja text-sm text-slate-500">読み込み中...</p>
          ) : sessions.length === 0 ? (
            <p className="px-6 pb-6 font-ja text-sm text-slate-500">
              まだ確定した添削結果がありません。
            </p>
          ) : (
            <ul className="space-y-2 px-6 pb-6">
              {sessions.map((s, idx) => {
                const score = s.maxScore > 0 ? `${s.totalScore ?? 0} / ${s.maxScore}点` : "得点未反映";
                return (
                  <li key={s.id}>
                    <Link
                      to={`/viewer/sessions/${s.id}`}
                      className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <span className="min-w-0 flex-1 font-ja text-sm">
                        <span className="font-semibold text-slate-900">
                          第{idx + 1}回のテスト
                          <span className="ml-2 font-normal text-slate-500">
                            （{formatDate(s.sessionDate)}）
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">{score}</span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
