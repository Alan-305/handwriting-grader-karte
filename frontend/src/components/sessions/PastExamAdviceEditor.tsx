import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isAdviceQuestionIncluded } from "@/lib/past-exam-advice-print-config";
import type { SessionPastExamAdvice } from "@/types/past-exam-advice";
import type { AdviceCard } from "@/types/firestore";

export function PastExamAdviceEditor({
  advice,
  includedQuestions,
  onIncludedChange,
  onChange,
}: {
  advice: SessionPastExamAdvice;
  includedQuestions: Record<string, boolean>;
  onIncludedChange: (questionOrder: number, included: boolean) => void;
  onChange: (next: SessionPastExamAdvice) => void;
}) {
  const patch = (partial: Partial<SessionPastExamAdvice>) => onChange({ ...advice, ...partial });

  const patchInsight = (order: number, partial: Partial<SessionPastExamAdvice["questionInsights"][0]>) => {
    patch({
      questionInsights: advice.questionInsights.map((item) =>
        item.questionOrder === order ? { ...item, ...partial } : item,
      ),
    });
  };

  const patchCard = (index: number, partial: Partial<AdviceCard>) => {
    patch({
      adviceCards: advice.adviceCards.map((c, i) => (i === index ? { ...c, ...partial } : c)),
    });
  };

  const setTalkingPoints = (text: string) => {
    patch({
      teacherTalkingPoints: text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    });
  };

  const setReferenced = (order: number, text: string) => {
    patchInsight(order, {
      referencedPastQuestions: text
        .split(/[,、]/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="no-print space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-ja font-semibold">総評・受験準備度</h3>
        <div>
          <label className="font-ja text-sm">総評</label>
          <Textarea
            className="mt-1 font-ja"
            rows={3}
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

      {advice.questionInsights.map((item) => (
        <Card
          key={item.questionOrder}
          className={`space-y-3 p-4 ${!isAdviceQuestionIncluded(includedQuestions, item.questionOrder) ? "opacity-60" : ""}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-ja font-semibold">第{item.questionOrder}問</h3>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 font-ja text-sm">
              <input
                type="checkbox"
                checked={isAdviceQuestionIncluded(includedQuestions, item.questionOrder)}
                onChange={(e) => onIncludedChange(item.questionOrder, e.target.checked)}
              />
              この大問を印刷に含める
            </label>
          </div>
          <div>
            <label className="font-ja text-sm">型ラベル</label>
            <Input
              className="mt-1 font-ja"
              value={item.matchedTypeLabel}
              onChange={(e) => patchInsight(item.questionOrder, { matchedTypeLabel: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">パフォーマンス要約</label>
            <Textarea
              className="mt-1 font-ja"
              rows={2}
              value={item.performanceSummary}
              onChange={(e) => patchInsight(item.questionOrder, { performanceSummary: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">過去問との関係</label>
            <Textarea
              className="mt-1 font-ja"
              rows={3}
              value={item.pastExamConnection}
              onChange={(e) => patchInsight(item.questionOrder, { pastExamConnection: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">次の学習アクション</label>
            <Textarea
              className="mt-1 font-ja"
              rows={2}
              value={item.studyAction}
              onChange={(e) => patchInsight(item.questionOrder, { studyAction: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">参照した過去問（カンマ区切り）</label>
            <Input
              className="mt-1 font-ja"
              value={item.referencedPastQuestions.join("、")}
              onChange={(e) => setReferenced(item.questionOrder, e.target.value)}
            />
          </div>
        </Card>
      ))}

      <Card className="space-y-3 p-4">
        <h3 className="font-ja font-semibold">面談で伝える要点</h3>
        <Textarea
          className="font-ja"
          rows={4}
          placeholder="1行に1要点"
          value={advice.teacherTalkingPoints.join("\n")}
          onChange={(e) => setTalkingPoints(e.target.value)}
        />
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
            <label className="font-ja text-sm">本文</label>
            <Textarea
              className="mt-1 font-ja"
              rows={3}
              value={card.body}
              onChange={(e) => patchCard(index, { body: e.target.value })}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
