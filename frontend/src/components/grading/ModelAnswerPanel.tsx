import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnText } from "@/components/typography/Typography";
import { useTts } from "@/hooks/useTts";

export function ModelAnswerPanel({ modelAnswer }: { modelAnswer: string }) {
  const { speak, stop, speaking, supported } = useTts();

  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex-1 space-y-1">
        <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
        <p className="text-model-answer font-en text-slate-900">{modelAnswer}</p>
      </div>
      {supported && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="音声読み上げ"
          onClick={() => (speaking ? stop() : speak(modelAnswer, "en"))}
        >
          {speaking ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>
      )}
    </div>
  );
}

export function TtsButton({ text, lang = "en" }: { text: string; lang?: "en" | "ja" }) {
  const { speak, stop, speaking, supported } = useTts();
  if (!supported) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="音声読み上げ"
      onClick={() => (speaking ? stop() : speak(text, lang))}
    >
      {speaking ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </Button>
  );
}
