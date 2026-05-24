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
import type { AggregatedStats, KarteSnapshot, Student } from "@/types/firestore";

export function StudentDashboardPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { getIdToken } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [snapshot, setSnapshot] = useState<KarteSnapshot | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    return onSnapshot(doc(getDb(), "students", studentId), (snap) => {
      if (snap.exists()) setStudent({ id: snap.id, ...snap.data() } as Student);
    });
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    return onSnapshot(doc(getDb(), "students", studentId, "stats", "aggregated"), (snap) => {
      if (snap.exists()) setStats(snap.data() as AggregatedStats);
    });
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    const q = query(
      collection(getDb(), "students", studentId, "karte_snapshots"),
      orderBy("generatedAt", "desc"),
      limit(1),
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setSnapshot({ id: d.id, ...d.data() } as KarteSnapshot);
      }
    });
  }, [studentId]);

  const runAnalysis = async () => {
    if (!studentId) return;
    setAnalyzing(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const result = await apiClient.analyzeStudent(token, studentId);
      setSnapshot(result as unknown as KarteSnapshot);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div>
      <LoadingOverlay visible={analyzing} message="考えてます" />
      <PageHeader
        title={`${student?.name ?? ""} のカルテ`}
        description="成績推移・弱点分析・志望校対策アドバイス"
      />
      <div className="space-y-6 p-8">
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/students">一覧に戻る</Link>
          </Button>
          <Button onClick={runAnalysis}>
            <RefreshCw className="h-4 w-4" />
            AI分析を実行
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>得点推移</CardTitle>
              <CardDescription>セッションごとの正答率</CardDescription>
            </CardHeader>
            <ScoreTrendChart stats={stats} />
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ミス傾向</CardTitle>
              <CardDescription>エラータグの出現頻度</CardDescription>
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
      </div>
    </div>
  );
}
