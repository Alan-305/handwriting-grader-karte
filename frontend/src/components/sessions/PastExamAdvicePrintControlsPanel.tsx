import { useState, type ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clampFontScale,
  clampLineHeight,
  clampMm,
  DEFAULT_GRADING_PRINT_LAYOUT,
} from "@/lib/grading-print-config";
import {
  PAST_EXAM_ADVICE_PRINT_PRESETS,
  PAST_EXAM_ADVICE_SECTION_LABELS,
  type GradingPrintLayoutSettings,
  type PastExamAdvicePrintPreferences,
  type PastExamAdvicePrintSectionId,
  type PastExamAdvicePrintSections,
} from "@/lib/past-exam-advice-print-config";
import {
  PAGE_MARGIN_LABEL,
  SECTION_MODE_LABEL,
  type PrintPageMargin,
  type PrintSectionMode,
} from "@/lib/print-layout-settings";

export function PastExamAdvicePrintControlsPanel({
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
  prefs: PastExamAdvicePrintPreferences;
  onSectionsChange: (sections: PastExamAdvicePrintSections) => void;
  onLayoutChange: (layout: GradingPrintLayoutSettings) => void;
  onResetLayout: () => void;
  onResetSections: () => void;
  templates: Array<{ id: string; name: string }>;
  onSaveTemplate: (name: string) => void;
  onApplyTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
}) {
  const [templateName, setTemplateName] = useState("");
  const layout = prefs.layout;

  const toggleSection = (id: PastExamAdvicePrintSectionId, checked: boolean) => {
    onSectionsChange({ ...prefs.sections, [id]: checked });
  };

  const setAllSections = (value: boolean) => {
    const next = { ...prefs.sections };
    for (const key of Object.keys(PAST_EXAM_ADVICE_SECTION_LABELS) as PastExamAdvicePrintSectionId[]) {
      next[key] = value;
    }
    onSectionsChange(next);
  };

  const updateLayout = <K extends keyof GradingPrintLayoutSettings>(
    key: K,
    value: GradingPrintLayoutSettings[K],
  ) => {
    onLayoutChange({ ...layout, [key]: value });
  };

  return (
    <Card className="no-print border-slate-200">
      <CardHeader>
        <CardTitle className="font-ja text-lg">過去問アドバイスの印刷設定</CardTitle>
        <CardDescription className="font-ja">
          掲載する項目を選び、A4レイアウトを調整できます。設定はテンプレとして保存できます。
        </CardDescription>
      </CardHeader>

      <div className="space-y-6 px-6 pb-6">
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
            {PAST_EXAM_ADVICE_PRINT_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9 font-ja"
                onClick={() => onSectionsChange(preset.sections)}
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(PAST_EXAM_ADVICE_SECTION_LABELS) as PastExamAdvicePrintSectionId[]).map(
              (id) => (
                <label
                  key={id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 font-ja text-sm"
                >
                  <input
                    type="checkbox"
                    checked={prefs.sections[id] !== false}
                    onChange={(e) => toggleSection(id, e.target.checked)}
                  />
                  {PAST_EXAM_ADVICE_SECTION_LABELS[id]}
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
          <Field label="ブロック間の余白（mm）">
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
          </Field>
        </section>
        <button
          type="button"
          className="font-ja text-sm text-slate-500 underline hover:text-slate-700"
          onClick={onResetLayout}
        >
          レイアウトを初期値に戻す
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
              placeholder="テンプレ名（例: 面談用）"
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
    </Card>
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
