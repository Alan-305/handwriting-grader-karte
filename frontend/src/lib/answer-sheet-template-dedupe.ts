import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { AnswerSheetTemplate, Test } from "@/types/firestore";

/** 用紙サイズ＋トンボ配置が同一かどうかのキー（名前は含めない） */
export function templateFingerprint(
  t: Pick<AnswerSheetTemplate, "pageWidth" | "pageHeight" | "alignmentMarks">,
): string {
  const marks = [...(t.alignmentMarks || [])].sort(
    (a, b) => a.corner.localeCompare(b.corner) || a.x - b.x || a.y - b.y,
  );
  return `${t.pageWidth}|${t.pageHeight}|${JSON.stringify(marks)}`;
}

export function groupTemplatesByFingerprint(
  templates: AnswerSheetTemplate[],
): Map<string, AnswerSheetTemplate[]> {
  const map = new Map<string, AnswerSheetTemplate[]>();
  for (const t of templates) {
    const key = templateFingerprint(t);
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return map;
}

/** 残す1件（名前に A4/標準 を含むもの優先 → 作成が古い順） */
export function pickCanonicalTemplate(group: AnswerSheetTemplate[]): AnswerSheetTemplate {
  const nameScore = (n: string) => (/A4|標準|a4/i.test(n) ? 1 : 0);
  return [...group].sort((a, b) => {
    const ns = nameScore(b.name) - nameScore(a.name);
    if (ns !== 0) return ns;
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  })[0];
}

export function countRedundantTemplates(templates: AnswerSheetTemplate[]): {
  duplicateGroups: number;
  removableCount: number;
} {
  let duplicateGroups = 0;
  let removableCount = 0;
  for (const [, group] of groupTemplatesByFingerprint(templates)) {
    if (group.length < 2) continue;
    duplicateGroups += 1;
    removableCount += group.length - 1;
  }
  return { duplicateGroups, removableCount };
}

/**
 * 同一レイアウトのテンプレートを1件に統合。参照している tests の templateId を付け替え、余分なテンプレートを削除。
 */
export async function mergeDuplicateAnswerSheetTemplates(
  teacherId: string,
  templates: AnswerSheetTemplate[],
): Promise<{ mergedGroups: number; removedTemplates: number; reassignedTests: number }> {
  const db = getDb();
  const testsSnap = await getDocs(query(collection(db, "tests"), where("teacherId", "==", teacherId)));
  const tests = testsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Test);

  let mergedGroups = 0;
  let removedTemplates = 0;
  let reassignedTests = 0;

  for (const [, group] of groupTemplatesByFingerprint(templates)) {
    if (group.length < 2) continue;
    mergedGroups += 1;
    const keeper = pickCanonicalTemplate(group);
    const losers = group.filter((t) => t.id !== keeper.id);

    for (const loser of losers) {
      const affected = tests.filter((t) => t.templateId === loser.id);
      for (const test of affected) {
        await updateDoc(doc(db, "tests", test.id), {
          templateId: keeper.id,
          updatedAt: serverTimestamp(),
        });
        reassignedTests += 1;
      }
      await deleteDoc(doc(db, "answer_sheet_templates", loser.id));
      removedTemplates += 1;
    }
  }

  return { mergedGroups, removedTemplates, reassignedTests };
}
