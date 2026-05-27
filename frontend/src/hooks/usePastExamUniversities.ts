import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { University } from "@/types/past-exam";

export const DEFAULT_PAST_EXAM_UNIVERSITIES: Pick<University, "slug" | "name" | "nameEn">[] = [
  { slug: "todai", name: "東京大学", nameEn: "The University of Tokyo" },
];

export function usePastExamUniversities() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(getDb(), "universities"), orderBy("name"));
    return onSnapshot(
      q,
      (snap) => {
        setUniversities(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as University));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const displayList: University[] =
    universities.length > 0
      ? universities
      : DEFAULT_PAST_EXAM_UNIVERSITIES.map((u) => ({
          id: u.slug,
          slug: u.slug,
          name: u.name,
          nameEn: u.nameEn,
          status: "active" as const,
        }));

  return { universities, displayList, loading };
}

/** URL・Firestore 用 slug（英小文字・数字・ハイフン・アンダースコア） */
export function slugifyUniversityId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
