import type { ReactNode } from "react";
import { CollapsiblePanel } from "@/components/layout/CollapsiblePanel";
import { CustomPageBreakControls } from "@/components/print/CustomPageBreakControls";
import { Input } from "@/components/ui/input";
import {
  clampFontScale,
  clampLineHeight,
  clampQuestionGapMm,
  DEFAULT_PRINT_LAYOUT_SETTINGS,
  PAGE_MARGIN_LABEL,
  SECTION_MODE_LABEL,
  toggleBreakBeforeOrder,
  type PrintLayoutSettings,
  type PrintPageMargin,
  type PrintSectionMode,
} from "@/lib/print-layout-settings";

export function PrintLayoutSettingsPanel({
  documentLabel,
  settings,
  onChange,
  onReset,
  questionOrders = [],
}: {
  documentLabel: "問題用紙" | "解答用紙" | "解答・解説・全訳";
  settings: PrintLayoutSettings;
  onChange: (settings: PrintLayoutSettings) => void;
  onReset: () => void;
  /** 大問 order の一覧（custom モードのチェック用） */
  questionOrders?: number[];
}) {
  const update = <K extends keyof PrintLayoutSettings>(
    key: K,
    value: PrintLayoutSettings[K],
  ) => {
    onChange({ ...settings, [key]: value });
  };

  const sortedOrders = [...questionOrders].sort((a, b) => a - b);

  return (
    <CollapsiblePanel
      storageKey={`print-layout-${documentLabel}`}
      title={`${documentLabel}レイアウト設定`}
      description="プレビューに即反映されます。問題用紙・解答用紙で設定は共通（テストごとに保存）です。"
      defaultOpen={documentLabel === "解答用紙" || documentLabel === "解答・解説・全訳"}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="大問の区切り">
          <select
            className="flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
            value={settings.sectionMode}
            onChange={(e) => update("sectionMode", e.target.value as PrintSectionMode)}
          >
            {(Object.keys(SECTION_MODE_LABEL) as PrintSectionMode[]).map((key) => (
              <option key={key} value={key}>
                {SECTION_MODE_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="大問間の余白（mm）">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={50}
                step={1}
                inputMode="numeric"
                className="h-11 font-en"
                value={settings.questionGapMm}
                onChange={(e) =>
                  update("questionGapMm", clampQuestionGapMm(Number(e.target.value)))
                }
              />
              <span className="shrink-0 font-ja text-sm text-slate-500">mm</span>
            </div>
            {settings.sectionMode === "split_first" && (
              <p className="font-ja text-xs text-slate-500">第1問独立時は第2問以降の間にのみ適用</p>
            )}
          </div>
        </Field>

        <Field label="ページ余白">
          <select
            className="flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
            value={settings.pageMargin}
            onChange={(e) => update("pageMargin", e.target.value as PrintPageMargin)}
          >
            {(Object.keys(PAGE_MARGIN_LABEL) as PrintPageMargin[]).map((key) => (
              <option key={key} value={key}>
                {PAGE_MARGIN_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="文字サイズ（%）">
          <Input
            type="number"
            min={85}
            max={120}
            step={1}
            inputMode="numeric"
            className="h-11 font-en"
            value={settings.fontScalePercent}
            onChange={(e) =>
              update("fontScalePercent", clampFontScale(Number(e.target.value)))
            }
          />
          <p className="font-ja text-xs text-slate-500">
            見出し・解説・全訳など、印刷全体の文字が連動して変わります（85〜120%）。
          </p>
        </Field>

        <Field label="行間">
          <Input
            type="number"
            min={1.25}
            max={1.9}
            step={0.05}
            className="h-11 font-en"
            value={settings.lineHeight}
            onChange={(e) => update("lineHeight", clampLineHeight(Number(e.target.value)))}
          />
          <p className="font-ja text-xs text-slate-500">解説・全訳など本文の行の開き（1.25〜1.9）。</p>
        </Field>
      </div>

      {settings.sectionMode === "custom" ? (
        <CustomPageBreakControls
          sectionMode={settings.sectionMode}
          questionOrders={sortedOrders}
          breakBeforeOrders={settings.breakBeforeOrders}
          onToggle={(order, enabled) =>
            onChange(toggleBreakBeforeOrder(settings, order, enabled))
          }
        />
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="font-ja text-sm text-slate-500 underline hover:text-slate-700"
          onClick={onReset}
        >
          初期値に戻す（第1問独立・余白 {DEFAULT_PRINT_LAYOUT_SETTINGS.questionGapMm}mm・文字{" "}
          {DEFAULT_PRINT_LAYOUT_SETTINGS.fontScalePercent}%）
        </button>
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
