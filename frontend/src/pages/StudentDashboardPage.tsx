import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { AdviceCardItem } from "@/components/dashboard/AdviceCard";
import { ErrorFrequencyChart, ScoreTrendChart } from "@/components/dashboard/Charts";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { getDb } from "@/lib/firebase";
import { runKarteAnalysisSteps } from "@/lib/karte-pipeline";
import type { AggregatedStats, KarteSnapshot, Student } from "@/types/firestore";

export function StudentDashboardPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { getIdToken, loading: authLoading, user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [snapshot, setSnapshot] = useState<KarteSnapshot | null>(null);
  const [studentLoading, setStudentLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [snapshotLoadError, setSnapshotLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId || authLoading || !user) return;
    setStudentLoading(true);
    return onSnapshot(
      doc(getDb(), "students", studentId),
      (snap) => {
        if (snap.exists()) setStudent({ id: snap.id, ...snap.data() } as Student);
        setStudentLoading(false);
      },
      (err) => {
        console.error("student listener error:", err);
        setStudentLoading(false);
      },
    );
  }, [studentId, authLoading, user]);

  useEffect(() => {
    if (!studentId || authLoading || !user) return;
    setStatsLoading(true);
    return onSnapshot(
      doc(getDb(), "students", studentId, "stats", "aggregated"),
      (snap) => {
        if (snap.exists()) setStats(snap.data() as AggregatedStats);
        setStatsLoading(false);
      },
      (err) => {
        console.error("stats listener error:", err);
        setStatsLoading(false);
      },
    );
  }, [studentId, authLoading, user]);

  useEffect(() => {
    if (!studentId || authLoading || !user) return;
    void (async () => {
      const token = await getIdToken();
      if (!token) return;
      try {
        await apiClient.refreshStats(token, studentId);
      } catch (error) {
        console.error("stats refresh failed:", error);
      }
    })();
  }, [studentId, authLoading, user, getIdToken]);

  useEffect(() => {
    if (!studentId || authLoading || !user) return;
    const q = query(
      collection(getDb(), "students", studentId, "karte_snapshots"),
      orderBy("generatedAt", "desc"),
      limit(1),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSnapshotLoadError(null);
        if (!snap.empty) {
          const d = snap.docs[0];
          setSnapshot({ id: d.id, ...d.data() } as KarteSnapshot);
        }
      },
      (err) => {
        setSnapshotLoadError(
          "カルテの読み込みに失敗しました。ページを再読み込みしてください。",
        );
        console.error("karte_snapshots listener error:", err);
      },
    );
  }, [studentId, authLoading, user]);

  const pageLoading = authLoading || studentLoading;

  const runAnalysis = async () => {
    if (!studentId) return;
    setAnalyzing(true);
    setAnalysisProgress(null);
    setAnalysisError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setAnalysisError("ログインが必要です");
        return;
      }
      const result = await runKarteAnalysisSteps(token, studentId, (_current, _total, message) => {
        setAnalysisProgress(message);
      });
      setSnapshot(result as unknown as KarteSnapshot);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "カルテ分析に失敗しました。しばらくしてから再試行してください。",
      );
    } finally {
      setAnalyzing(false);
      setAnalysisProgress(null);
    }
  };

  return (
    <div>
      <LoadingOverlay
        visible={analyzing || pageLoading}
        message={analyzing ? analysisProgress ?? "考えてます" : "読み込み中..."}
      />
      <PageHeader
        title={`${student?.name ?? (pageLoading ? "読み込み中…" : "")} のカルテ`}
        description="成績推移・弱点分析・志望校対策アドバイス"
      />
      <div className="page-content space-y-6">
        {student &&
          !student.targetUniversities?.length &&
          !student.interviewProfile?.targetUniversities?.length && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardHeader className="pb-2">
                <CardTitle className="font-ja text-base text-amber-900">面談内容が未登録です</CardTitle>
                <CardDescription className="font-ja text-amber-800">
                  志望校・共通テスト・確定事項を基本情報に登録してから AI 分析すると、関係のない学部の話が混ざりにくくなります。
                </CardDescription>
              </CardHeader>
              <Button variant="outline" asChild className="mx-6 mb-4">
                <Link to={`/students/${studentId}/profile`}>基本情報を入力する</Link>
              </Button>
            </Card>
          )}
        {analysisError && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="font-ja text-sm text-red-800">{analysisError}</p>
          </Card>
        )}

        {snapshotLoadError && (
          <Card className="border-amber-200 bg-amber-50 p-4">
            <p className="font-ja text-sm text-amber-900">{snapshotLoadError}</p>
          </Card>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/students">一覧に戻る</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/students/${studentId}/profile`}>基本情報</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/students/${studentId}/interview`}>面談記録</Link>
          </Button>
          <Button onClick={runAnalysis}>
            <RefreshCw className="h-4 w-4" />
            AI分析を実行
          </Button>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>得点推移</CardTitle>
              <CardDescription>
                テストごと1点（同一テストの再添削は上書き）。正答率の推移です。
              </CardDescription>
            </CardHeader>
            <ScoreTrendChart stats={statsLoading ? null : stats} />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ミス傾向</CardTitle>
              <CardDescription>
                第1回の棒グラフの下に第2回、さらに第3回…と、テストごとに一般カテゴリのミス傾向が積み上がります。同一テストの再添削は上書きです。
              </CardDescription>
            </CardHeader>
            <ErrorFrequencyChart stats={statsLoading ? null : stats} />
          </Card>
        </div>

        {snapshot && (
          <>
            {snapshot.integrityWarnings && snapshot.integrityWarnings.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/60 p-4">
                <CardHeader className="p-0 pb-2">
                  <CardTitle className="font-ja text-base text-amber-900">
                    整合チェックの警告（内容をご確認ください）
                  </CardTitle>
                </CardHeader>
                <ul className="list-disc space-y-1 pl-5 font-ja text-sm text-amber-900">
                  {snapshot.integrityWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Card>
            )}
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
      </div>
    </div>
  );
}
