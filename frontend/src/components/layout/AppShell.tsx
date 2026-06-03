import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Archive,
  BookOpen,
  ClipboardList,
  FileEdit,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/students", label: "生徒", icon: Users },
  { to: "/tests", label: "問題", icon: BookOpen },
  { to: "/question-drafts", label: "下書き", icon: FileEdit },
  { to: "/sessions/new", label: "添削", icon: ClipboardList },
  { to: "/past-exams", label: "過去問", icon: Archive },
  { to: "/universities", label: "志望校", icon: GraduationCap },
];

const mobileQuickNav = [
  { to: "/students", label: "生徒", icon: Users },
  { to: "/sessions/new", label: "添削", icon: ClipboardList },
  { to: "/tests", label: "問題", icon: BookOpen },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 font-ja text-sm transition-colors",
              isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
            )
          }
        >
          <Icon className="h-5 w-5 shrink-0" />
          {label}
        </NavLink>
      ))}
    </>
  );
}

export function AppShell() {
  const { logout, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50 lg:flex-row">
      {/* スマホ・タブレット: 上部バー */}
      <header className="no-print sticky top-0 z-40 flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 shrink-0"
          onClick={() => setMenuOpen(true)}
          aria-label="メニューを開く"
        >
          <Menu className="h-6 w-6" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LayoutDashboard className="h-5 w-5 shrink-0 text-blue-800" />
          <span className="truncate font-ja text-sm font-semibold text-slate-900">大学別個人指導カルテ</span>
        </div>
      </header>

      {/* ドロワーメニュー */}
      {menuOpen && (
        <>
          <button
            type="button"
            className="no-print fixed inset-0 z-50 bg-black/40 lg:hidden"
            aria-label="メニューを閉じる"
            onClick={closeMenu}
          />
          <aside
            className="no-print fixed inset-y-0 left-0 z-50 flex w-[min(100vw-2.5rem,18rem)] flex-col border-r border-slate-200 bg-white shadow-xl lg:hidden"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="truncate font-ja text-xs text-slate-500">{user?.email}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                onClick={closeMenu}
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              <NavItems onNavigate={closeMenu} />
            </nav>
            <div className="border-t border-slate-200 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Button
                variant="ghost"
                className="min-h-11 w-full justify-start gap-2"
                onClick={() => {
                  closeMenu();
                  void logout();
                }}
              >
                <LogOut className="h-4 w-4" />
                ログアウト
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* PC: サイドバー */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-blue-800" />
            <span className="font-ja text-sm font-semibold text-slate-900">大学別個人指導カルテ</span>
          </div>
          <p className="mt-1 truncate font-ja text-xs text-slate-500">{user?.email}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <NavItems />
        </nav>
        <div className="border-t border-slate-200 p-4">
          <Button variant="ghost" className="min-h-11 w-full justify-start gap-2" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            ログアウト
          </Button>
        </div>
      </aside>

      <main className="main-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>

      {/* スマホ: よく使う画面へのショートカット */}
      <nav
        className="no-print fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="主要メニュー"
      >
        {mobileQuickNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 font-ja text-[10px] transition-colors sm:text-xs",
                isActive ? "text-blue-800" : "text-slate-600",
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 font-ja text-[10px] text-slate-600 sm:text-xs"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
          その他
        </button>
      </nav>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="no-print border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
      <h1 className="font-ja text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">{title}</h1>
      {description && (
        <p className="mt-1 font-ja text-sm leading-relaxed text-slate-500">{description}</p>
      )}
    </div>
  );
}

type PageContentMax = "sm" | "md" | "lg" | "xl" | "full";

const maxWidthClass: Record<PageContentMax, string> = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
  full: "max-w-none",
};

/** 画面本文の共通余白（モバイルの下ナビ・safe-area 分の padding-bottom 込み） */
export function PageContent({
  children,
  className,
  maxWidth = "full",
}: {
  children: React.ReactNode;
  className?: string;
  maxWidth?: PageContentMax;
}) {
  return (
    <div className={cn("page-content mx-auto w-full min-w-0", maxWidthClass[maxWidth], className)}>
      {children}
    </div>
  );
}
