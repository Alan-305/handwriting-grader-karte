import { Link, Outlet } from "react-router-dom";
import { Eye, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

/**
 * 閲覧者（生徒・保護者）向けの読み取り専用シェル。
 * 編集系のナビゲーションは一切持たず、ヘッダーに「閲覧専用」を明示する。
 */
export function ViewerShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50">
      <header className="no-print sticky top-0 z-40 flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Link to="/viewer" className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 font-ja text-xs font-semibold text-blue-800">
            <Eye className="h-3.5 w-3.5" />
            閲覧専用
          </span>
          <span className="truncate font-ja text-sm font-semibold text-slate-900">
            個人指導カルテ
          </span>
        </Link>
        <span className="hidden truncate font-ja text-xs text-slate-500 sm:inline">{user?.email}</span>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 shrink-0 gap-2 font-ja text-sm text-slate-600"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">ログアウト</span>
        </Button>
      </header>

      <main className="main-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
