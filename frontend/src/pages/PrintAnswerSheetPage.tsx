import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { PageHeader } from "@/components/layout/AppShell";
import { AnswerSheetPrintLayout } from "@/components/print/AnswerSheetPrintLayout";
import { PrintLayoutSettingsPanel } from "@/components/print/PrintLayoutSettingsPanel";
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
  const [loading, setLoading] = useState(true);
  const { settings, setSettings, reset } = usePrintLayoutSettings(testId);
  const printRef = useRef<HTMLDivElement>(null);
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
      const questions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question);
      const layout = generateAnswerSheetLayout(questions);
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

  return (
    <div>
      <PageHeader
        title="解答用紙（印刷用）"
        description="レイアウトを調整してから印刷してください"
      />
      <div className="no-print space-y-4 p-8 pb-0">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => printRef.current && printElement(printRef.current)}>印刷 / PDF</Button>
          <Button variant="outline" asChild>
            <Link to={`/tests/${testId}/print/test-paper`}>問題用紙を印刷</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/tests/${testId}`}>問題エディタに戻る</Link>
          </Button>
        </div>
        <PrintLayoutSettingsPanel
          documentLabel="解答用紙"
          settings={settings}
          onChange={setSettings}
          onReset={reset}
        />
      </div>
      <div ref={printRef} className="bg-slate-100 p-8 print:bg-white print:p-0">
        <AnswerSheetPrintLayout testTitle={test.title} slots={slots} settings={settings} />
      </div>
    </div>
  );
}
