import { Timestamp } from "firebase/firestore";

export type GradeLevel = "優" | "良" | "不可";
export type QuestionType = "english" | "japanese" | "symbol";
export type AnswerSheetFormat =
  | "japanese_grid"
  | "underline"
  | "english_composition"
  | "short";

/** 添削プロンプトの種別（模範解答なしのとき no_model 用プロンプトを使用） */
export type GradingMode = "standard" | "no_model";
export type SessionStatus = "uploaded" | "aligning" | "grading" | "review" | "completed";

/** 解答用紙形式ごとの数値設定（設問入力時に教師が指定） */
export interface AnswerFormatOptions {
  /** マス目：行数 */
  gridRows?: number;
  /** マス目：字数指定（用紙上に表示） */
  charLimit?: number;
  /** 下線部：下線の本数 */
  underlineLines?: number;
  /** 自由英作文：目標語数 */
  targetWords?: number;
  /** 自由英作文：下線の本数 */
  compositionLines?: number;
}

export interface Teacher {
  uid: string;
  displayName: string;
  email: string;
  createdAt: Timestamp;
}

export interface TargetUniversityRef {
  universityId: string;
  name: string;
  faculty: string;
  priority: number;
}

export interface Student {
  id: string;
  teacherId: string;
  name: string;
  course: string;
  targetUniversities: TargetUniversityRef[];
  memo?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TargetUniversity {
  id: string;
  name: string;
  faculty: string;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  examTrends: string;
  passingScoreGuide?: string;
  updatedAt: Timestamp;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignmentMark {
  corner: "tl" | "tr" | "bl" | "br";
  x: number;
  y: number;
}

export interface AnswerSheetTemplate {
  id: string;
  teacherId: string;
  name: string;
  pageWidth: number;
  pageHeight: number;
  alignmentMarks: AlignmentMark[];
  createdAt: Timestamp;
}

export interface AnswerPart {
  /** 表示ラベル（例: "(1)"） */
  label: string;
  answerFormat: AnswerSheetFormat;
  formatOptions?: AnswerFormatOptions;
  /** 未指定時は answerFormat / 問題文から自動判定 */
  gradingMode?: GradingMode;
  modelAnswer?: string;
  cropRegion: CropRegion;
}

export interface Question {
  id: string;
  order: number;
  type: QuestionType;
  /** 添削・統計用の問題タイプとは別に、解答用紙のレイアウト形式 */
  answerFormat?: AnswerSheetFormat;
  formatOptions?: AnswerFormatOptions;
  /** 小問 (1)(2)(3) ごとの解答欄。2件以上のときのみ使用 */
  answerParts?: AnswerPart[];
  /** 未指定時は answerFormat / 問題文から自動判定 */
  gradingMode?: GradingMode;
  prompt: string;
  modelAnswer: string;
  points: number;
  cropRegion: CropRegion;
  rubric?: string;
}

export interface Test {
  id: string;
  teacherId: string;
  title: string;
  templateId: string;
  totalPoints: number;
  questionCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GradingProgress {
  current: number;
  total: number;
  message: "添削中" | "考えてます";
}

export interface Session {
  id: string;
  teacherId: string;
  studentId: string;
  testId: string;
  status: SessionStatus;
  sessionDate: Timestamp;
  sourceImagePath: string;
  alignedImagePath?: string;
  totalScore: number;
  maxScore: number;
  /** 100点満点換算の合計得点 */
  totalScore100?: number;
  gradingProgress?: GradingProgress;
  completedAt?: Timestamp;
  /** 生徒用返却プリントの内容が教師により確定された日時 */
  studentPrintFinalizedAt?: Timestamp;
}

export interface QuestionResult {
  id: string;
  questionId: string;
  order: number;
  partIndex?: number;
  partLabel?: string;
  type: QuestionType;
  croppedImagePath: string;
  grade: GradeLevel;
  score: number;
  maxPoints: number;
  studentAnswerText?: string;
  feedback: string;
  explanation: string;
  modelAnswer: string;
  errorTags: string[];
  teacherNotes?: string;
  createdAt: Timestamp;
}

export interface PrintSection {
  questionOrder: number;
  studentAnswer: string;
  grade: string;
  explanation: string;
  modelAnswer: string;
  teacherNotes?: string;
}

export interface PrintArtifact {
  id: string;
  type: "student" | "teacher";
  content: { sections: PrintSection[] };
  generatedAt: Timestamp;
}

export interface AdviceCard {
  title: string;
  body: string;
  category: "grammar" | "vocabulary" | "structure" | "exam_strategy";
  priority: "high" | "medium" | "low";
}

export interface KarteSnapshot {
  id: string;
  generatedAt: Timestamp;
  sessionIdsIncluded: string[];
  sessionCount: number;
  weaknessSummary: string;
  errorFrequency: Record<string, number>;
  adviceCards: AdviceCard[];
  readinessComment: string;
  geminiModel: string;
}

export interface AggregatedStats {
  totalSessions: number;
  scoreHistory: Array<{
    sessionId: string;
    date: Timestamp;
    totalScore: number;
    maxScore: number;
  }>;
  questionTypeAccuracy: {
    english: number[];
    japanese: number[];
    symbol: number[];
  };
  topErrorTags: Array<{ tag: string; count: number }>;
  lastUpdated: Timestamp;
}
