import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { PageHeader } from "@/components/layout/AppShell";
import { AnswerSheetDropzone } from "@/components/upload/AnswerSheetDropzone";
import { ErrorRetry } from "@/components/feedback/ErrorRetry";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { GradingChecklist, useBackendHealth } from "@/components/grading/GradingChecklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useStudents } from "@/hooks/useStudent";
import { apiClient } from "@/lib/api-client";
import { generateAnswerSheetLayout, layoutPageCount } from "@/lib/answer-sheet-layout";
import { getDb } from "@/lib/firebase";
import { primaryPastExamSlug } from "@/lib/resolve-university";
import type { Question, Test } from "@/types/firestore";

export function SessionNewPage() {
  const { user, getIdToken } = useAuth();
  const { students } = useStudents();
  const backendOk = useBackendHealth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<Test[]>([]);
  const [questionsByTest, setQuestionsByTest] = useState<Record<string, Question[]>>({});
  const [studentId, setStudentId] = useState("");
  const [testId, setTestId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>("位置合わせ中");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(getDb(), "tests"), where("teacherId", "==", user.uid));
    return onSnapshot(q, (snap) => {
      setTests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Test));
    });
  }, [user]);

  useEffect(() => {
    if (!testId) return;
    const q = query(collection(getDb(), "tests", testId, "questions"));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question);
      rows.sort((a, b) => a.order - b.order);
      setQuestionsByTest((prev) => ({ ...prev, [testId]: rows }));
    });
  }, [testId]);

  const selectedStudent = students.find((s) => s.id === studentId);
  const studentUniSlug = primaryPastExamSlug(selectedStudent);

  const testsForStudent = useMemo(() => {
    if (!studentUniSlug) return tests;
    return tests.filter(
      (t) => !t.universitySlug || t.universitySlug === studentUniSlug,
    );
  }, [tests, studentUniSlug]);

  useEffect(() => {
    if (testId && !testsForStudent.some((t) => t.id === testId)) {
      setTestId("");
      setFiles([]);
    }
  }, [testsForStudent, testId]);

  const selectedTest = testsForStudent.find((t) => t.id === testId);
  const selectedQuestions = testId ? questionsByTest[testId] ?? [] : [];

  const expectedPages = useMemo(() => {
    if (selectedQuestions.length === 0) return 1;
    const layout = generateAnswerSheetLayout(selectedQuestions);
    return layoutPageCount(layout.slots);
  }, [selectedQuestions]);

  const uploadHint = useMemo(() => {
    if (expectedPages <= 1) {
      return "1枚だけでもアップロードできます。2枚に分かれている場合は、1枚目→2枚目の順で追加してください。";
    }
    return `このテストは最大 ${expectedPages} 枚の解答用紙想定です。書けた枚数だけでも構いません（1枚のみ可）。ある場合は印刷順どおり 1枚目→2枚目… の順で追加してください。`;
  }, [expectedPages]);

  const canGrade =
    students.length > 0 &&
    selectedTest &&
    selectedTest.questionCount > 0 &&
    selectedTest.templateId &&
    backendOk === true &&
    files.length > 0;

  const runGrading = async () => {
    if (files.length === 0 || !studentId || !testId) return;
    setLoading(true);
    setError("");
    setProgressMsg("位置合わせ中");
    try {
      const token = await getIdToken();
      if (!token) return;

      const form = new FormData();
      for (const file of files) {
        form.append("images", file);
      }
      form.append("studentId", studentId);
      form.append("testId", testId);

      const { sessionId } = await apiClient.uploadSession(token, form);
      await apiClient.alignSession(token, sessionId);
      navigate(`/sessions/${sessionId}/crop-review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "添削に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <LoadingOverlay visible={loading} message={progressMsg} />
      <PageHeader
        title="答案添削"
        description="手書きを読み取り、確認後に添削します"
      />
      <div className="page-content mx-auto max-w-2xl space-y-6">
        <GradingChecklist
          studentsCount={students.length}
          tests={tests}
          backendOk={backendOk}
        />

        <Card className="space-y-4">
          <div>
            <label className="font-ja text-sm text-slate-600">生徒</label>
            <select
              className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setTestId("");
                setFiles([]);
              }}
            >
              <option value="">選択してください</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-ja text-sm text-slate-600">テスト</label>
            <select
              className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja"
              value={testId}
              onChange={(e) => {
                setTestId(e.target.value);
                setFiles([]);
              }}
            >
              <option value="">選択してください</option>
              {testsForStudent.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}（{t.questionCount}問）
                  {t.universitySlug ? ` · ${t.universitySlug}` : ""}
                </option>
              ))}
            </select>
            {studentUniSlug && (
              <p className="mt-1 font-ja text-xs text-slate-500">
                生徒の志望校（{studentUniSlug}）に紐づく問題セットを優先表示しています。
              </p>
            )}
            {selectedTest && !selectedTest.templateId && (
              <p className="mt-1 font-ja text-xs text-amber-700">
                このテストには解答用紙テンプレートが未設定です。問題エディタで設定してください。
              </p>
            )}
            {selectedTest && selectedTest.templateId && expectedPages > 1 && (
              <p className="mt-1 font-ja text-xs text-blue-800">
                解答用紙は最大 {expectedPages} 枚想定です。1枚だけの提出でもアップロードできます。
              </p>
            )}
          </div>
        </Card>

        <AnswerSheetDropzone
          files={files}
          onFilesChange={setFiles}
          disabled={loading}
          hint={testId ? uploadHint : undefined}
        />

        {error && <ErrorRetry message={error} onRetry={runGrading} />}

        <Button
          className="w-full min-h-11"
          disabled={!canGrade || loading}
          onClick={runGrading}
        >
          アップロードして切り出し
        </Button>
      </div>
    </div>
  );
}
