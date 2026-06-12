import { useState, type ReactNode } from "react";
import { CollapsiblePanel } from "@/components/layout/CollapsiblePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clampFontScale,
  clampLineHeight,
  clampMm,
  DEFAULT_GRADING_PRINT_LAYOUT,
  STUDENT_PRINT_PRESETS,
  STUDENT_SECTION_LABELS,
  TEACHER_PRINT_PRESETS,
  TEACHER_SECTION_LABELS,
  type GradingPrintKind,
  type GradingPrintLayoutSettings,
  type GradingPrintPreferences,
  type StudentPrintSectionId,
  type TeacherPrintSectionId,
} from "@/lib/grading-print-config";
import {
  PAGE_MARGIN_LABEL,
  SECTION_MODE_LABEL,
  type PrintPageMargin,
  type PrintSectionMode,
} from "@/lib/print-layout-settings";

export function GradingPrintControlsPanel({
  kind,
  prefs,
  onSectionsChange,
  onLayoutChange,
  onResetLayout,
  onResetSections,
  templates,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
}: {
  kind: GradingPrintKind;
  prefs: GradingPrintPreferences;
  onSectionsChange: (sections: GradingPrintPreferences["sections"]) => void;
  onLayoutChange: (layout: GradingPrintLayoutSettings) => void;
  onResetLayout: () => void;
  onResetSections: () => void;
  templates: Array<{ id: string; name: string }>;
  onSaveTemplate: (name: string) => void;
  onApplyTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const [templateName, setTemplateName] = useState("");
  const sectionLabels = kind === "student" ? STUDENT_SECTION_LABELS : TEACHER_SECTION_LABELS;
  const presets = kind === "student" ? STUDENT_PRINT_PRESETS : TEACHER_PRINT_PRESETS;
  const layout = prefs.layout;

  const toggleSection = (id: string, checked: boolean) => {
    onSectionsChange({
      ...prefs.sections,
      [id]: checked,
    } as GradingPrintPreferences["sections"]);
  };

  const setAllSections = (value: boolean) => {
    const next = { ...prefs.sections };
    for (const key of Object.keys(sectionLabels)) {
      (next as Record<string, boolean>)[key] = value;
    }
    onSectionsChange(next as GradingPrintPreferences["sections"]);
  };

  const updateLayout = <K extends keyof GradingPrintLayoutSettings>(
    key: K,
    value: GradingPrintLayoutSettings[K],
  ) => {
    onLayoutChange({ ...layout, [key]: value });
  };

  return (
    <CollapsiblePanel
      storageKey={`grading-print-controls-${kind}`}
      title={kind === "student" ? "返却プリントの印刷設定" : "教師用指導資料の印刷設定"}
      description="掲載項目・A4レイアウトを調整します。折りたたむと右のプレビューと編集欄の高さを揃えやすくなります。"
      defaultOpen={false}
    >
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="font-ja text-sm font-medium text-slate-800">掲載する項目</p>
            <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => setAllSections(true)}>
              すべて選択
            </Button>
            <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => setAllSections(false)}>
              すべて解除
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 font-ja"
                onClick={() => onSectionsChange(preset.sections as GradingPrintPreferences["sections"])}
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(sectionLabels) as Array<StudentPrintSectionId | TeacherPrintSectionId>).map(
              (id) => (
                <label
                  key={id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 font-ja text-sm"
                >
                  <input
                    type="checkbox"
                    checked={(prefs.sections as Record<string, boolean>)[id] !== false}
                    onChange={(e) => toggleSection(id, e.target.checked)}
                  />
                  {sectionLabels[id as keyof typeof sectionLabels]}
                </label>
              ),
            )}
          </div>
          <button
            type="button"
            className="mt-2 font-ja text-sm text-slate-500 underline hover:text-slate-700"
            onClick={onResetSections}
          >
            項目の選択を初期値に戻す
          </button>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="大問の区切り">
            <select
              className="flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
              value={layout.sectionMode}
              onChange={(e) => updateLayout("sectionMode", e.target.value as PrintSectionMode)}
            >
              {(Object.keys(SECTION_MODE_LABEL) as PrintSectionMode[]).map((key) => (
                <option key={key} value={key}>
                  {SECTION_MODE_LABEL[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ページ余白">
            <select
              className="flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
              value={layout.pageMargin}
              onChange={(e) => updateLayout("pageMargin", e.target.value as PrintPageMargin)}
            >
              {(Object.keys(PAGE_MARGIN_LABEL) as PrintPageMargin[]).map((key) => (
                <option key={key} value={key}>
                  {PAGE_MARGIN_LABEL[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="大問間の余白（mm）">
            <Input
              type="number"
              min={0}
              max={50}
              className="h-11 font-en"
              value={layout.questionGapMm}
              onChange={(e) =>
                updateLayout("questionGapMm", clampMm(Number(e.target.value), layout.questionGapMm, 50))
              }
            />
          </Field>
          <Field label="コメント間の余白（mm）">
            <Input
              type="number"
              min={0}
              max={30}
              className="h-11 font-en"
              value={layout.blockGapMm}
              onChange={(e) =>
                updateLayout("blockGapMm", clampMm(Number(e.target.value), layout.blockGapMm))
              }
            />
          </Field>
          <Field label="文字サイズ（%）">
            <Input
              type="number"
              min={85}
              max={120}
              className="h-11 font-en"
              value={layout.fontScalePercent}
              onChange={(e) =>
                updateLayout("fontScalePercent", clampFontScale(Number(e.target.value)))
              }
            />
            <p className="font-ja text-xs text-slate-500">
              見出し・解答・解説・模範解答など、プリント全体の文字が連動して変わります（85〜120%）。
            </p>
          </Field>
          <Field label="行間">
            <Input
              type="number"
              min={1.25}
              max={1.9}
              step={0.05}
              className="h-11 font-en"
              value={layout.lineHeight}
              onChange={(e) =>
                updateLayout("lineHeight", clampLineHeight(Number(e.target.value)))
              }
            />
            <p className="font-ja text-xs text-slate-500">
              講評・解説・過去問アドバイスなど本文の行の開き（1.25〜1.9）。
            </p>
          </Field>
        </section>
        <button
          type="button"
          className="font-ja text-sm text-slate-500 underline hover:text-slate-700"
          onClick={onResetLayout}
        >
          レイアウトを初期値に戻す（A4標準・余白 {DEFAULT_GRADING_PRINT_LAYOUT.questionGapMm}mm）
        </button>

        <section className="border-t border-slate-100 pt-4">
          <p className="font-ja text-sm font-medium text-slate-800">レイアウトテンプレート</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9 font-ja"
                  onClick={() => onApplyTemplate(t.id)}
                >
                  {t.name}
                </Button>
                <button
                  type="button"
                  className="px-2 font-ja text-xs text-slate-400 hover:text-red-600"
                  aria-label={`${t.name}を削除`}
                  onClick={() => onDeleteTemplate(t.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              className="max-w-xs font-ja"
              placeholder="テンプレ名（例: 返却用）"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-11 font-ja"
              onClick={() => {
                onSaveTemplate(templateName);
                setTemplateName("");
              }}
            >
              現在の設定を保存
            </Button>
          </div>
        </section>
      </div>
    </CollapsiblePanel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-ja text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
