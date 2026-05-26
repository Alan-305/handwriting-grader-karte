import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { TeacherPrintLayout } from "@/components/print/PrintLayouts";
import { Button } from "@/components/ui/button";
import { useSession, useSavePrintArtifact } from "@/hooks/useSession";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";

export function PrintTeacherPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { results, loading } = useSession(sessionId);
  const { saveArtifact } = useSavePrintArtifact(sessionId ?? "");
  const { getIdToken } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const handleComplete = async () => {
    const token = await getIdToken();
    if (!token || !sessionId) return;
    await saveArtifact("teacher", {
      sections: results.map((r) => ({
        questionOrder: r.order,
        studentAnswer: r.studentAnswerText ?? "",
        grade: r.grade ?? "良",
        explanation: r.explanation ?? "",
        modelAnswer: r.modelAnswer,
        teacherNotes: r.teacherNotes,
      })),
    });
    await apiClient.completeSession(token, sessionId);
  };

  if (loading) return <div className="p-8 font-ja">読み込み中...</div>;

  return (
    <div>
      <PageHeader title="教師用指導資料" />
      <div className="no-print flex gap-2 p-8">
        <Button onClick={() => printRef.current && printElement(printRef.current)}>印刷</Button>
        <Button
          variant="outline"
          onClick={() =>
            printRef.current && exportElementToPdf(printRef.current, `teacher-${sessionId}.pdf`)
          }
        >
          PDF保存
        </Button>
        <Button onClick={handleComplete}>セッション完了</Button>
        <Button variant="ghost" asChild>
          <Link to={`/sessions/${sessionId}`}>結果に戻る</Link>
        </Button>
      </div>
      <div ref={printRef}>
        <TeacherPrintLayout results={results} />
      </div>
    </div>
  );
}
