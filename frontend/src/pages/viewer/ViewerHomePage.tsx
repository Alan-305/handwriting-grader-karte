import { Link } from "react-router-dom";
import { ChevronRight, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { useViewerStudents } from "@/hooks/useViewer";

export function ViewerHomePage() {
  const { students, loading } = useViewerStudents();

  return (
    <div>
      <PageHeader title="カルテ・添削結果" description="先生から共有された生徒の成果物を閲覧できます" />
      <div className="page-content mx-auto max-w-3xl space-y-4">
        {loading ? (
          <p className="font-ja text-slate-500">読み込み中...</p>
        ) : students.length === 0 ? (
          <Card className="p-6 text-center font-ja text-sm leading-relaxed text-slate-500">
            <p>閲覧できる生徒がまだありません。</p>
            <p className="mt-2 text-xs text-slate-400">
              先生が招待したメールアドレスと、ログイン中のメールアドレスが一致しているかご確認ください。
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {students.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/viewer/students/${s.id}`}
                  className="flex min-h-16 items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-800">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-ja text-base font-semibold text-slate-900">
                      {s.name}
                    </span>
                    {s.course && (
                      <span className="block truncate font-ja text-sm text-slate-500">{s.course}</span>
                    )}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
