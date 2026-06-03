/** 返却プリント用: 講評・解説内の生徒名呼びかけを「あなた」に置き換える */
export function depersonalizeForStudentPrint(text: string, studentName?: string): string {
  if (!text?.trim() || !studentName?.trim()) return text;

  let out = text;
  const name = studentName.trim();
  const variants = new Set<string>([name]);
  const family = name.split(/\s+/)[0]?.trim();
  if (family && family !== name) variants.add(family);

  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`${escaped}さんの`, "g"), "あなたの");
    out = out.replace(new RegExp(`${escaped}さんは`, "g"), "あなたは");
    out = out.replace(new RegExp(`${escaped}さん、`, "g"), "あなた、");
    out = out.replace(new RegExp(`${escaped}さん`, "g"), "あなた");
  }

  return out;
}
