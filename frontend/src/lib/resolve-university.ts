import type { Student, TargetUniversityRef } from "@/types/firestore";

/** 生徒の第一志望に紐づく過去問コーパス slug */
export function primaryPastExamSlug(student: Student | null | undefined): string | null {
  if (!student) return null;
  const profile = student.interviewProfile;
  const targets: TargetUniversityRef[] =
    profile?.targetUniversities?.length
      ? profile.targetUniversities
      : student.targetUniversities ?? [];
  if (targets.length === 0) return null;
  const ordered = [...targets].sort((a, b) => a.priority - b.priority);
  for (const ref of ordered) {
    const slug = (ref.pastExamSlug ?? ref.universityId ?? "").trim();
    if (slug) return slug;
  }
  return null;
}

export function primaryUniversityLabel(
  student: Student | null | undefined,
  universityNames: Map<string, string>,
): string | null {
  const slug = primaryPastExamSlug(student);
  if (!slug) return null;
  return universityNames.get(slug) ?? slug;
}
