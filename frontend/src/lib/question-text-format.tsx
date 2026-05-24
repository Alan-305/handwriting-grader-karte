import type { ReactNode } from "react";

type Segment =
  | { kind: "text"; value: string }
  | { kind: "blank"; em: number; inParens?: boolean }
  | { kind: "emphasis"; value: string };

/** *語句* 記法：英文・和文を含む場合に下線強調として解釈 */
const EMPHASIS_CHAR = /[a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

function isEmphasisMarkup(raw: string): boolean {
  const inner = raw.slice(1, -1).trim();
  return inner.length > 0 && EMPHASIS_CHAR.test(inner);
}

function emphasisFontClass(value: string): string {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(value) ? "font-ja" : "font-en";
}

/** 問題文内の空欄・下線強調記法を印刷用セグメントに分解する */
export function parseQuestionText(text: string): Segment[] {
  if (!text) return [];

  const pattern = /(\*[^*\n]+\*)|(_{3,})|(＿{2,})|(\([ \u3000]+\))/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      if (isEmphasisMarkup(match[1])) {
        segments.push({ kind: "emphasis", value: match[1].slice(1, -1) });
      } else {
        segments.push({ kind: "text", value: match[1] });
      }
    } else if (match[2]) {
      const count = match[2].length;
      segments.push({ kind: "blank", em: Math.min(20, Math.max(3, Math.ceil(count / 2))) });
    } else if (match[3]) {
      segments.push({ kind: "blank", em: Math.min(20, Math.max(3, match[3].length * 2)) });
    } else if (match[4]) {
      segments.push({ kind: "blank", em: 8, inParens: true });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

function dominantScript(text: string): "ja" | "en" {
  const plain = text.replace(/\*[^*\n]+\*/g, (m) => m.slice(1, -1)).replace(/_{3,}|＿{2,}/g, "");
  const latin = (plain.match(/[a-zA-Z]/g) || []).length;
  const cjk = (plain.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
  if (latin === 0 && cjk === 0) return "ja";
  return latin >= cjk ? "en" : "ja";
}

function UnderlineBlank({ em, inParens }: { em: number; inParens?: boolean }) {
  const line = (
    <span
      className="mx-0.5 inline-block align-baseline border-b border-slate-900 print:border-black"
      style={{ minWidth: `${em}em`, height: "1.15em", verticalAlign: "baseline" }}
      aria-hidden
    />
  );

  if (inParens) {
    return (
      <span className="whitespace-nowrap font-ja">
        （{line}）
      </span>
    );
  }

  return line;
}

function EmphasisText({ value }: { value: string }) {
  return (
    <span
      className={`${emphasisFontClass(value)} underline decoration-slate-900 decoration-1 underline-offset-[3px] print:decoration-black`}
      style={{ textUnderlineOffset: "3px" }}
    >
      {value}
    </span>
  );
}

export function QuestionPromptText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const segments = parseQuestionText(text);
  const script = dominantScript(text);
  const paragraphClass =
    script === "en" ? "question-prompt-en font-en" : "question-prompt-ja font-ja";

  if (segments.length === 0) {
    return null;
  }

  return (
    <p className={`leading-relaxed text-slate-900 ${paragraphClass} ${className}`}>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <span key={i}>{seg.value}</span>;
        }
        if (seg.kind === "emphasis") {
          return <EmphasisText key={i} value={seg.value} />;
        }
        return <UnderlineBlank key={i} em={seg.em} inParens={seg.inParens} />;
      })}
    </p>
  );
}

export function QuestionPromptBlock({
  prompt,
  className = "",
}: {
  prompt: string;
  className?: string;
}) {
  const lines = prompt.split("\n");

  return (
    <div className={`space-y-2 ${className}`}>
      {lines.map((line, i) =>
        line.trim() ? (
          <QuestionPromptText key={i} text={line} />
        ) : (
          <div key={i} className="h-2" aria-hidden />
        ),
      )}
    </div>
  );
}

export const QUESTION_TEXT_HINT =
  "空欄は ___・＿＿・（　　　）。特定の語句に下線を引く場合は *important* や *重要な決定* のように両脇に * を付けます。";

export function hasUnderlineMarkup(text: string): boolean {
  return (
    /_{3,}|＿{2,}|\([ \u3000]+\)/.test(text) ||
    /\*[^*\n]*[a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF][^*\n]*\*/.test(text)
  );
}

export function previewQuestionSegments(text: string): ReactNode {
  return <QuestionPromptText text={text} className="text-sm text-slate-700" />;
}
