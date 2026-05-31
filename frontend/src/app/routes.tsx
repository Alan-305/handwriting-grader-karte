import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ViewerShell } from "@/components/layout/ViewerShell";
import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/pages/LoginPage";
import { ViewerLoginPage } from "@/pages/viewer/ViewerLoginPage";
import { ViewerFinishPage } from "@/pages/viewer/ViewerFinishPage";
import { ViewerHomePage } from "@/pages/viewer/ViewerHomePage";
import { ViewerStudentDashboardPage } from "@/pages/viewer/ViewerStudentDashboardPage";
import { ViewerSessionResultPage } from "@/pages/viewer/ViewerSessionResultPage";
import { PrintAnswerSheetPage } from "@/pages/PrintAnswerSheetPage";
import { PrintTestPaperPage } from "@/pages/PrintTestPaperPage";
import { PrintStudentPage } from "@/pages/PrintStudentPage";
import { PrintTeacherPage } from "@/pages/PrintTeacherPage";
import { SessionNewPage } from "@/pages/SessionNewPage";
import { SessionResultPage } from "@/pages/SessionResultPage";
import { SessionGradingReviewPage } from "@/pages/SessionGradingReviewPage";
import { SessionManualCropPage } from "@/pages/SessionManualCropPage";
import { SessionTranscriptionReviewPage } from "@/pages/SessionTranscriptionReviewPage";
import { StudentDashboardPage } from "@/pages/StudentDashboardPage";
import { StudentBasicInfoPage } from "@/pages/StudentBasicInfoPage";
import { StudentInterviewPage } from "@/pages/StudentInterviewPage";
import { StudentsPage } from "@/pages/StudentsPage";
import { TestEditorPage } from "@/pages/TestEditorPage";
import { TestsPage } from "@/pages/TestsPage";
import { UniversitiesPage } from "@/pages/UniversitiesPage";
import { PastExamsPage } from "@/pages/PastExamsPage";
import { UniversityPastExamsPage } from "@/pages/UniversityPastExamsPage";
import { PastExamImportPage } from "@/pages/PastExamImportPage";
import { PastExamImportReviewPage } from "@/pages/PastExamImportReviewPage";
import { PastExamYearDetailPage } from "@/pages/PastExamYearDetailPage";
import { QuestionGeneratePage } from "@/pages/QuestionGeneratePage";
import { QuestionDraftsPage } from "@/pages/QuestionDraftsPage";

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center font-ja text-slate-600">
      読み込み中...
    </div>
  );
}

/** 教師（編集者）専用ルート。閲覧者は閲覧ホームへ送る */
function RequireTeacher({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "viewer") return <Navigate to="/viewer" replace />;
  return <>{children}</>;
}

/** 閲覧者専用ルート。教師は通常画面へ送る */
function RequireViewer({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/viewer/login" replace />;
  if (role === "teacher") return <Navigate to="/students" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/viewer/login" element={<ViewerLoginPage />} />
      <Route path="/viewer/finish" element={<ViewerFinishPage />} />
      <Route
        path="/viewer"
        element={
          <RequireViewer>
            <ViewerShell />
          </RequireViewer>
        }
      >
        <Route index element={<ViewerHomePage />} />
        <Route path="students/:studentId" element={<ViewerStudentDashboardPage />} />
        <Route path="sessions/:sessionId" element={<ViewerSessionResultPage />} />
      </Route>
      <Route
        element={
          <RequireTeacher>
            <AppShell />
          </RequireTeacher>
        }
      >
        <Route index element={<Navigate to="/students" replace />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:studentId/dashboard" element={<StudentDashboardPage />} />
        <Route path="students/:studentId/profile" element={<StudentBasicInfoPage />} />
        <Route path="students/:studentId/interview" element={<StudentInterviewPage />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="tests/:testId" element={<TestEditorPage />} />
        <Route path="questions/generate" element={<QuestionGeneratePage />} />
        <Route path="question-drafts" element={<QuestionDraftsPage />} />
        <Route path="tests/:testId/print/answer-sheet" element={<PrintAnswerSheetPage />} />
        <Route path="tests/:testId/print/test-paper" element={<PrintTestPaperPage />} />
        <Route path="tests/new" element={<TestEditorPage />} />
        <Route path="sessions/new" element={<SessionNewPage />} />
        <Route path="sessions/:sessionId/crop-review" element={<SessionManualCropPage />} />
        <Route path="sessions/:sessionId/transcription" element={<SessionTranscriptionReviewPage />} />
        <Route path="sessions/:sessionId/grading-review" element={<SessionGradingReviewPage />} />
        <Route path="sessions/:sessionId" element={<SessionResultPage />} />
        <Route path="sessions/:sessionId/print/student" element={<PrintStudentPage />} />
        <Route path="sessions/:sessionId/print/teacher" element={<PrintTeacherPage />} />
        <Route path="universities" element={<UniversitiesPage />} />
        <Route path="past-exams" element={<PastExamsPage />} />
        <Route path="past-exams/:slug" element={<UniversityPastExamsPage />} />
        <Route path="past-exams/:slug/import" element={<PastExamImportPage />} />
        <Route path="past-exams/:slug/import/:sessionId/review" element={<PastExamImportReviewPage />} />
        <Route path="past-exams/:slug/years/:year" element={<PastExamYearDetailPage />} />
      </Route>
    </Routes>
  );
}
