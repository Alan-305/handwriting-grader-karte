import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/pages/LoginPage";
import { PrintAnswerSheetPage } from "@/pages/PrintAnswerSheetPage";
import { PrintTestPaperPage } from "@/pages/PrintTestPaperPage";
import { PrintStudentPage } from "@/pages/PrintStudentPage";
import { PrintTeacherPage } from "@/pages/PrintTeacherPage";
import { SessionNewPage } from "@/pages/SessionNewPage";
import { SessionResultPage } from "@/pages/SessionResultPage";
import { StudentDashboardPage } from "@/pages/StudentDashboardPage";
import { StudentsPage } from "@/pages/StudentsPage";
import { TestEditorPage } from "@/pages/TestEditorPage";
import { TestsPage } from "@/pages/TestsPage";
import { UniversitiesPage } from "@/pages/UniversitiesPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-ja text-slate-600">
        読み込み中...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/students" replace />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:studentId/dashboard" element={<StudentDashboardPage />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="tests/:testId" element={<TestEditorPage />} />
        <Route path="tests/:testId/print/answer-sheet" element={<PrintAnswerSheetPage />} />
        <Route path="tests/:testId/print/test-paper" element={<PrintTestPaperPage />} />
        <Route path="tests/new" element={<TestEditorPage />} />
        <Route path="sessions/new" element={<SessionNewPage />} />
        <Route path="sessions/:sessionId" element={<SessionResultPage />} />
        <Route path="sessions/:sessionId/print/student" element={<PrintStudentPage />} />
        <Route path="sessions/:sessionId/print/teacher" element={<PrintTeacherPage />} />
        <Route path="universities" element={<UniversitiesPage />} />
      </Route>
    </Routes>
  );
}
