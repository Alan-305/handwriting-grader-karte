import { Timestamp } from "firebase/firestore";
import type { QuestionType } from "./firestore";

export type AnswerFormat = "japanese_writing" | "english_writing" | "symbol" | "composite";

export type ProfileStatus = "draft" | "approved";
export type ModelAnswerSource = "official" | "teacher" | "ai_draft" | "none";

export interface PastQuestionProfile {
  archetype: string;
  requiredSkills: string[];
  commonTraps: string[];
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  scoringFocus: string;
}

export interface University {
  id: string;
  slug: string;
  name: string;
  nameEn?: string;
  status: "active" | "archived";
  updatedAt?: Timestamp;
}

export interface ListeningScript {
  title?: string;
  content: string;
  notes?: string;
}

export interface ExamYear {
  id: string;
  year: number;
  examType: string;
  sourceUrl?: string;
  /** @deprecated use sourcePdfPaths */
  sourcePdfPath?: string;
  sourcePdfPaths?: string[];
  sourceAnswersPdfPath?: string;
  sourceListeningPdfPath?: string;
  importStatus: ProfileStatus;
  listeningImportStatus?: ProfileStatus;
  questionCount?: number;
  listeningScriptCount?: number;
  listeningScripts?: ListeningScript[];
  listeningParseNotes?: string;
  parseNotes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PastQuestion {
  id: string;
  year: number;
  majorOrder: number;
  partLabel?: string;
  type: QuestionType;
  answerFormat?: AnswerFormat;
  prompt: string;
  modelAnswer: string;
  modelAnswerSource: ModelAnswerSource;
  modelAnswerStatus: ProfileStatus;
  points?: number;
  profile: PastQuestionProfile;
  profileStatus: ProfileStatus;
  importNotes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** API 取り込みドラフト（Gemini 解析結果） */
export interface ParsedPastQuestionDraft {
  majorOrder: number;
  partLabel?: string | null;
  type: QuestionType;
  answerFormat?: AnswerFormat;
  prompt: string;
  modelAnswer: string;
  points?: number | null;
  notes?: string;
}

export interface ListeningScriptDraft {
  title?: string;
  content: string;
  notes?: string;
}

export interface PastExamParseDraft {
  universityName?: string;
  year: number;
  examType?: string;
  questions: ParsedPastQuestionDraft[];
  listeningScripts?: ListeningScriptDraft[];
  parseNotes?: string;
}

export interface TeacherExamMaterialAttachment {
  name: string;
  storagePath: string;
  contentType: string;
  uploadedAt?: Timestamp;
}

/** 教師が年度ごとに登録する分析資料（メモ・PDF 等） */
export interface TeacherExamMaterial {
  id: string;
  teacherId: string;
  universitySlug: string;
  year: number;
  title: string;
  content: string;
  attachments: TeacherExamMaterialAttachment[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
