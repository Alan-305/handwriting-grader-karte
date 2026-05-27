import { useState } from "react";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  COMMON_TEST_SCORE_OPTIONS,
  COMMON_TEST_SUBJECTS,
  COMMON_TEST_YEAR_OPTIONS,
  CONFIRMED_FACT_OPTIONS,
} from "@/constants/student-interview";
import { usePastExamUniversities } from "@/hooks/usePastExamUniversities";
import type { StudentInterviewProfile, TargetUniversityRef } from "@/types/firestore";

const selectClass =
  "mt-1 flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-ja text-sm text-slate-900";

export function emptyStudentProfile(): StudentInterviewProfile {
  return {
    targetUniversities: [],
    commonTestScores: {},
    confirmedFactIds: [],
  };
}

export function profileFromStudent(
  interviewProfile?: StudentInterviewProfile,
  legacyTargets?: TargetUniversityRef[],
): StudentInterviewProfile {
  if (interviewProfile) {
    return {
      ...emptyStudentProfile(),
      ...interviewProfile,
      targetUniversities:
        interviewProfile.targetUniversities?.length
          ? interviewProfile.targetUniversities
          : legacyTargets ?? [],
    };
  }
  return { ...emptyStudentProfile(), targetUniversities: legacyTargets ?? [] };
}

type Props = {
  profile: StudentInterviewProfile;
  onChange: (next: StudentInterviewProfile) => void;
  readOnly?: boolean;
};

export function StudentProfileFields({ profile, onChange, readOnly = false }: Props) {
  const { displayList, loading } = usePastExamUniversities();
  const [addSlug, setAddSlug] = useState("");
  const [addFaculty, setAddFaculty] = useState("");

  const usedSlugs = new Set(
    profile.targetUniversities.map((u) => u.pastExamSlug ?? u.universityId),
  );
  const uniOptions = displayList.filter((u) => !usedSlugs.has(u.slug));

  const addTargetUniversity = () => {
    if (!addSlug || readOnly) return;
    const u = displayList.find((x) => x.slug === addSlug);
    if (!u) return;
    const ref: TargetUniversityRef = {
      universityId: u.slug,
      pastExamSlug: u.slug,
      name: u.name,
      faculty: addFaculty.trim() || "（学部未入力）",
      priority: profile.targetUniversities.length + 1,
    };
    onChange({ ...profile, targetUniversities: [...profile.targetUniversities, ref] });
    setAddSlug("");
    setAddFaculty("");
  };

  const removeTargetUniversity = (universityId: string) => {
    if (readOnly) return;
    onChange({
      ...profile,
      targetUniversities: profile.targetUniversities
        .filter((u) => u.universityId !== universityId)
        .map((u, i) => ({ ...u, priority: i + 1 })),
    });
  };

  const movePriority = (universityId: string, dir: -1 | 1) => {
    if (readOnly) return;
    const list = [...profile.targetUniversities].sort((a, b) => a.priority - b.priority);
    const idx = list.findIndex((u) => u.universityId === universityId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    onChange({
      ...profile,
      targetUniversities: list.map((u, i) => ({ ...u, priority: i + 1 })),
    });
  };

  const toggleFact = (id: string) => {
    if (readOnly) return;
    onChange({
      ...profile,
      confirmedFactIds: profile.confirmedFactIds.includes(id)
        ? profile.confirmedFactIds.filter((x) => x !== id)
        : [...profile.confirmedFactIds, id],
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-100 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-ja text-base text-blue-900">志望校と過去問の連動</CardTitle>
          <CardDescription className="font-ja leading-relaxed text-blue-800">
            志望校は
            <Link to="/past-exams" className="font-semibold underline">
              過去問
            </Link>
            に登録した大学から選びます（{loading ? "読み込み中" : `${displayList.length} 校`}）。
            学部名は手入力してください。問題生成・カルテ分析で志望校の文脈に使われます。
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-ja text-lg">志望校・学部</CardTitle>
        </CardHeader>
        <div className="space-y-3 px-6 pb-6">
          {profile.targetUniversities.length === 0 ? (
            <p className="font-ja text-sm text-slate-500">志望校が未登録です。</p>
          ) : (
            <ul className="space-y-2">
              {[...profile.targetUniversities]
                .sort((a, b) => a.priority - b.priority)
                .map((u) => (
                  <li
                    key={u.universityId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <span className="font-ja text-xs text-slate-500">第{u.priority}志望</span>
                      <p className="font-ja font-medium">
                        {u.name} — {u.faculty}
                      </p>
                      {u.pastExamSlug && (
                        <p className="font-ja text-xs text-slate-400">過去問: {u.pastExamSlug}</p>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-1">
                        <Button type="button" variant="outline" size="sm" onClick={() => movePriority(u.universityId, -1)}>
                          ↑
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => movePriority(u.universityId, 1)}>
                          ↓
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeTargetUniversity(u.universityId)}>
                          削除
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          )}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <select className={`${selectClass} max-w-xs flex-1`} value={addSlug} onChange={(e) => setAddSlug(e.target.value)}>
                <option value="">大学を選択...</option>
                {uniOptions.map((u) => (
                  <option key={u.slug} value={u.slug}>
                    {u.name}
                  </option>
                ))}
              </select>
              <Input
                className="max-w-xs font-ja"
                placeholder="学部（例: 理科三類）"
                value={addFaculty}
                onChange={(e) => setAddFaculty(e.target.value)}
              />
              <Button type="button" disabled={!addSlug} onClick={addTargetUniversity}>
                <Plus className="h-4 w-4" />
                追加
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-ja text-lg">大学入学共通テスト</CardTitle>
        </CardHeader>
        <div className="space-y-4 px-6 pb-6">
          <div>
            <label className="font-ja text-sm text-slate-600">受験年度</label>
            <select
              className={`${selectClass} max-w-xs`}
              disabled={readOnly}
              value={profile.commonTestYear ? String(profile.commonTestYear) : ""}
              onChange={(e) =>
                onChange({
                  ...profile,
                  commonTestYear: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            >
              <option value="">未選択</option>
              {COMMON_TEST_YEAR_OPTIONS().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {COMMON_TEST_SUBJECTS.map((sub) => (
              <div key={sub.id}>
                <label className="font-ja text-sm text-slate-600">{sub.label}</label>
                <select
                  className={selectClass}
                  disabled={readOnly}
                  value={profile.commonTestScores[sub.id] ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...profile,
                      commonTestScores: { ...profile.commonTestScores, [sub.id]: e.target.value },
                    })
                  }
                >
                  {COMMON_TEST_SCORE_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-ja text-lg">確定事項</CardTitle>
          <CardDescription className="font-ja">指導方針として確定したチェック項目</CardDescription>
        </CardHeader>
        <ul className="space-y-2 px-6 pb-6">
          {CONFIRMED_FACT_OPTIONS.map((opt) => (
            <li key={opt.id}>
              <label
                className={`flex min-h-11 items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 ${readOnly ? "opacity-80" : "cursor-pointer hover:bg-slate-50"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  disabled={readOnly}
                  checked={profile.confirmedFactIds.includes(opt.id)}
                  onChange={() => toggleFact(opt.id)}
                />
                <span className="font-ja text-sm">{opt.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
