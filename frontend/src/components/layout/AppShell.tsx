import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, ClipboardList, GraduationCap, LayoutDashboard, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/students", label: "生徒", icon: Users },
  { to: "/tests", label: "問題", icon: BookOpen },
  { to: "/sessions/new", label: "添削", icon: ClipboardList },
  { to: "/universities", label: "志望校", icon: GraduationCap },
];

export function AppShell() {
  const { logout, user } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="no-print flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-blue-800" />
          </div>
          <p className="mt-1 truncate font-ja text-xs text-slate-500">{user?.email}</p>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 font-ja text-sm transition-colors",
                  isActive ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            ログアウト
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="no-print border-b border-slate-200 bg-white px-8 py-6">
      <h1 className="font-ja text-2xl font-semibold text-slate-900">{title}</h1>
      {description && <p className="mt-1 font-ja text-sm text-slate-500">{description}</p>}
    </div>
  );
}
