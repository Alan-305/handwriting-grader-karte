import type { Test } from "@/types/firestore";

export function sessionUploadBlockReason({
  studentId,
  selectedTest,
  questionCount,
  backendOk,
  fileCount,
  loading,
}: {
  studentId: string;
  selectedTest: Test | undefined;
  questionCount: number;
  backendOk: boolean | null;
  fileCount: number;
  loading: boolean;
}): string | null {
  if (loading) return null;
  if (!studentId) return "生徒を選択してください。";
  if (!selectedTest) return "テストを選択してください。";
  if (questionCount <= 0) {
    return "選択したテストに設問がありません。問題エディタで設問を追加してください。";
  }
  if (!selectedTest.templateId) {
    return "このテストに解答用紙テンプレートが未設定です。問題エディタで設定してください。";
  }
  if (backendOk === null) return "バックエンド API への接続を確認しています…";
  if (backendOk === false) {
    return "バックエンド API が起動していません。backend で python run.py を実行してください。";
  }
  if (fileCount <= 0) return "答案ファイル（写真または PDF）を追加してください。";
  return null;
}

export function canStartSessionUpload({
  studentId,
  selectedTest,
  questionCount,
  backendOk,
  fileCount,
}: {
  studentId: string;
  selectedTest: Test | undefined;
  questionCount: number;
  backendOk: boolean | null;
  fileCount: number;
}): boolean {
  return (
    Boolean(studentId) &&
    Boolean(selectedTest) &&
    questionCount > 0 &&
    Boolean(selectedTest?.templateId) &&
    backendOk === true &&
    fileCount > 0
  );
}
