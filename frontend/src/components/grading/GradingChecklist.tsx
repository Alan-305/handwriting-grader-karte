import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Test } from "@/types/firestore";

interface ChecklistProps {
  studentsCount: number;
  tests: Test[];
  backendOk: boolean | null;
}

export function GradingChecklist({ studentsCount, tests, backendOk }: ChecklistProps) {
  const readyTest = tests.find((t) => t.questionCount > 0 && t.templateId);
  const items = [
    {
      ok: studentsCount > 0,
      label: "生徒が登録されている",
      link: "/students",
    },
    {
      ok: tests.some((t) => t.questionCount > 0),
      label: "問題セットに設問がある",
      link: "/tests",
    },
    {
      ok: Boolean(readyTest),
      label: "テストに解答用紙テンプレートが設定されている",
      link: readyTest ? `/tests/${readyTest.id}` : "/universities",
      hint: "志望校 → テンプレート作成 → 問題エディタで紐付け",
    },
    {
      ok: backendOk === true,
      label: "バックエンド API が起動している",
      link: null,
      hint: backendOk === false ? "backend で python run.py を実行" : undefined,
    },
  ];

  const allReady = items.every((i) => i.ok);

  if (allReady) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <div className="mb-3 flex items-center gap-2 font-ja font-semibold text-amber-900">
        <AlertCircle className="h-5 w-5" />
        添削を始める前のチェックリスト
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 font-ja text-sm">
            {item.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            )}
            <div>
              {item.link && !item.ok ? (
                <Link to={item.link} className="text-blue-800 underline">
                  {item.label}
                </Link>
              ) : (
                <span className={item.ok ? "text-slate-700" : "text-slate-600"}>{item.label}</span>
              )}
              {item.hint && !item.ok && (
                <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function useBackendHealth() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const url = API_BASE ? `${API_BASE}/api/health` : "/api/health";
    fetch(url)
      .then(async (r) => {
        if (!r.ok) return false;
        const data = (await r.json()) as { status?: string };
        return data.status === "ok";
      })
      .then(setOk)
      .catch(() => setOk(false));
  }, []);

  return ok;
}
