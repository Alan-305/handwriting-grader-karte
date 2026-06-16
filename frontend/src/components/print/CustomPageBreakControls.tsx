import type { PrintSectionMode } from "@/lib/print-layout-settings";

/** custom モード時：大問ごとの改ページ位置チェック */
export function CustomPageBreakControls({
  sectionMode,
  questionOrders,
  breakBeforeOrders = [],
  onToggle,
}: {
  sectionMode: PrintSectionMode;
  questionOrders: number[];
  breakBeforeOrders?: number[];
  onToggle: (questionOrder: number, enabled: boolean) => void;
}) {
  if (sectionMode !== "custom") return null;

  const sortedOrders = [...questionOrders].sort((a, b) => a - b);

  if (sortedOrders.length <= 1) {
    return (
      <p className="mt-4 font-ja text-xs text-slate-500">
        大問が2問以上あると、改ページ位置を指定できます。
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <p className="font-ja text-sm font-semibold text-slate-800">改ページ位置</p>
      <p className="mt-1 font-ja text-xs leading-relaxed text-slate-600">
        チェックを入れた大問の<strong>直前</strong>で改ページします。チェックなしの連続大問は同じページに続けて配置されます。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sortedOrders.slice(1).map((order) => {
          const checked = breakBeforeOrders.includes(order);
          return (
            <label
              key={order}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-ja text-sm text-slate-800"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onToggle(order, e.target.checked)}
              />
              第{order}問の前
            </label>
          );
        })}
      </div>
      <p className="mt-3 font-ja text-xs text-slate-500">
        例：第3問の前だけチェック → 第1–2問を同じページに、第3問から改ページ。
      </p>
    </div>
  );
}
