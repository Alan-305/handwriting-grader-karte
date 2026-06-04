import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
    <div className="no-print space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-ja font-semibold">総評・受験準備度</h3>
        <p className="font-ja text-xs text-slate-500">
          ①②③ の箇条書きで短く編集できます。設問別の解説は添削結果側に任せ、ここでは全体像だけ書きます。
        </p>
        <div>
          <label className="font-ja text-sm">総評</label>
          <Textarea
            className="mt-1 font-ja"
            rows={4}
            value={advice.overallSummary}
            onChange={(e) => patch({ overallSummary: e.target.value })}
          />
        </div>
        <div>
          <label className="font-ja text-sm">受験準備度（過去問との比較）</label>
          <Textarea
            className="mt-1 font-ja"
            rows={3}
            value={advice.readinessVsExam}
            onChange={(e) => patch({ readinessVsExam: e.target.value })}
          />
        </div>
      </Card>

      {advice.adviceCards.map((card, index) => (
        <Card key={`${card.title}-${index}`} className="space-y-3 p-4">
          <h3 className="font-ja font-semibold">アドバイスカード {index + 1}</h3>
          <div>
            <label className="font-ja text-sm">タイトル</label>
            <Input
              className="mt-1 font-ja"
              value={card.title}
              onChange={(e) => patchCard(index, { title: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">本文（1文程度）</label>
            <Textarea
              className="mt-1 font-ja"
              rows={2}
              value={card.body}
              onChange={(e) => patchCard(index, { body: e.target.value })}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
