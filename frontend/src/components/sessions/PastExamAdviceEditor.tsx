import { CollapsiblePanel } from "@/components/layout/CollapsiblePanel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  adviceCardAnchor,
  adviceReadinessAnchor,
  adviceSummaryAnchor,
} from "@/lib/preview-anchor";
import type { SessionPastExamAdvice } from "@/types/past-exam-advice";
import type { AdviceCard } from "@/types/firestore";

export function PastExamAdviceEditor({
  advice,
  onChange,
}: {
  advice: SessionPastExamAdvice;
  onChange: (next: SessionPastExamAdvice) => void;
}) {
  const patch = (partial: Partial<SessionPastExamAdvice>) => onChange({ ...advice, ...partial });

  const patchCard = (index: number, partial: Partial<AdviceCard>) => {
    patch({
      adviceCards: advice.adviceCards.map((c, i) => (i === index ? { ...c, ...partial } : c)),
    });
  };

  return (
    <div className="no-print space-y-3">
      <CollapsiblePanel
        storageKey="past-exam-advice-summary"
        title="総評・受験準備度"
        description="①②③ の箇条書きで短く編集できます。"
        defaultOpen
      >
        <div className="space-y-3">
          <div>
            <label className="font-ja text-sm">総評</label>
            <Textarea
              className="mt-1 font-ja"
              rows={4}
              value={advice.overallSummary}
              onChange={(e) => patch({ overallSummary: e.target.value })}
              data-preview-anchor={adviceSummaryAnchor()}
            />
          </div>
          <div>
            <label className="font-ja text-sm">受験準備度（過去問との比較）</label>
            <Textarea
              className="mt-1 font-ja"
              rows={3}
              value={advice.readinessVsExam}
              onChange={(e) => patch({ readinessVsExam: e.target.value })}
              data-preview-anchor={adviceReadinessAnchor()}
            />
          </div>
        </div>
      </CollapsiblePanel>

      {advice.adviceCards.map((card, index) => (
        <CollapsiblePanel
          key={`${card.title}-${index}`}
          storageKey={`past-exam-advice-card-${index}`}
          title={`アドバイスカード ${index + 1}`}
          defaultOpen={index === 0}
        >
          <div className="space-y-3">
            <div>
              <label className="font-ja text-sm">タイトル</label>
              <Input
                className="mt-1 font-ja"
                value={card.title}
                onChange={(e) => patchCard(index, { title: e.target.value })}
                data-preview-anchor={adviceCardAnchor(index)}
              />
            </div>
            <div>
              <label className="font-ja text-sm">本文（1文程度）</label>
              <Textarea
                className="mt-1 font-ja"
                rows={2}
                value={card.body}
                onChange={(e) => patchCard(index, { body: e.target.value })}
                data-preview-anchor={adviceCardAnchor(index)}
              />
            </div>
          </div>
        </CollapsiblePanel>
      ))}
    </div>
  );
}
