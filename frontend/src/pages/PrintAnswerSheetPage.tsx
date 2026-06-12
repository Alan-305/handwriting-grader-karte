import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { PageHeader } from "@/components/layout/AppShell";
import { SyncPreviewSplit } from "@/components/layout/SyncPreviewSplit";
import { AnswerSheetPrintLayout } from "@/components/print/AnswerSheetPrintLayout";
import { PrintLayoutSettingsPanel } from "@/components/print/PrintLayoutSettingsPanel";
import { PrintPreviewPane } from "@/components/print/PrintPreviewPane";
import { Button } from "@/components/ui/button";
import { usePrintLayoutSettings } from "@/hooks/usePrintLayoutSettings";
import { usePrintShortcut } from "@/hooks/usePrintShortcut";
import { printElement } from "@/lib/pdf-export";
import { generateAnswerSheetLayout } from "@/lib/answer-sheet-layout";
import type { LayoutSlot } from "@/lib/answer-sheet-layout";
import { getDb } from "@/lib/firebase";
import type { Question, Test } from "@/types/firestore";

export function PrintAnswerSheetPage() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [slots, setSlots] = useState<LayoutSlot[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const { settings, setSettings, reset } = usePrintLayoutSettings(testId);
  const printRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  usePrintShortcut(printRef);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!testId) return;
    (async () => {
      const testSnap = await getDoc(doc(getDb(), "tests", testId));
      if (!testSnap.exists()) {
        setLoading(false);
        return;
      }
      const testData = { id: testSnap.id, ...testSnap.data() } as Test;
      setTest(testData);

      const qSnap = await getDocs(
        query(collection(getDb(), "tests", testId, "questions"), orderBy("order")),
      );
      const loaded = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question);
      setQuestions(loaded);
      const layout = generateAnswerSheetLayout(loaded);
      setSlots(layout.slots);
      setLoading(false);
    })();
  }, [testId]);

  if (loading) {
    return <div className="page-content font-ja text-slate-500">読み込み中...</div>;
  }

  if (!test || slots.length === 0) {
    return (
      <div className="space-y-4 p-8 font-ja">
        <p>解答用紙を生成できません。設問を追加してから「解答用紙を自動生成」を実行してください。</p>
        <Button asChild variant="outline">
          <Link to={`/tests/${testId}`}>問題エディタに戻る</Link>
        </Button>
      </div>
    );
  }

  const settingsPane = (
    <div className="space-y-4 p-4 pb-8 sm:p-6">
      <PrintLayoutSettingsPanel
        documentLabel="解答用紙"
        settings={settings}
        onChange={setSettings}
        onReset={reset}
      />
    </div>
  );

  const previewPane = (
    <PrintPreviewPane title="印刷プレビュー" printRef={printRef} scrollRef={previewScrollRef}>
      <AnswerSheetPrintLayout
        testTitle={test.title}
        slots={slots}
        settings={settings}
        questionIdByOrder={Object.fromEntries(questions.map((q) => [q.order, q.id]))}
      />
    </PrintPreviewPane>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <PageHeader
        title="解答用紙（印刷用）"
        description="左でレイアウト調整、右で印刷プレビュー（境界をドラッグで幅調整）"
      />

      <div className="no-print shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => printRef.current && printElement(printRef.current)}>
            印刷 / PDF
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <Link to={`/tests/${testId}/print/test-paper`}>問題用紙を印刷</Link>
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <Link to={`/tests/${testId}/print/answer-key`}>解答・解説・全訳</Link>
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <Link to={`/tests/${testId}`}>問題エディタに戻る</Link>
          </Button>
        </div>
      </div>

      <SyncPreviewSplit
        storageKey="print-answer-sheet"
        defaultRatio={0.38}
        className="min-h-0 flex-1"
        previewScrollRef={previewScrollRef}
        syncEnabled={false}
        left={settingsPane}
        right={previewPane}
      />
    </div>
  );
}
