import { Timestamp } from "firebase/firestore";

export type GradeLevel = "優" | "良" | "不可";
export type QuestionType = "english" | "japanese" | "symbol";
export type AnswerSheetFormat =
  | "japanese_grid"
  | "underline"
  | "english_composition"
  | "short"
  | "composite";

/** 添削プロンプトの種別（模範解答なしのとき no_model 用プロンプトを使用） */
export type GradingMode = "standard" | "no_model";
export type SessionStatus =
  | "uploaded"
  | "aligning"
  | "aligned"
  | "crop_review"
  | "transcribing"
  | "transcription_review"
  | "grading"
  | "review"
  | "completed";

export type TranscriptionStatus = "pending_review" | "confirmed";

/** 解答用紙の小問ラベル: (1)(2)… または (A)(B)… */
export type PartLabelScheme = "numeric" | "alpha";

/** 解答用紙形式ごとの数値設定（設問入力時に教師が指定） */
export interface AnswerFormatOptions {
  /** マス目：行数 */
  gridRows?: number;
  /** マス目：列数（1行あたりのマス数。表示はフォーマット側でクランプ） */
  gridCols?: number;
  /** マス目：字数指定（用紙上に表示） */
  charLimit?: number;
  /** 下線部：下線の本数 */
  underlineLines?: number;
  /** 下線部：解答欄の長さ */
  underlineWidth?: "short" | "medium" | "long";
  /** 自由英作文：目標語数 */
  targetWords?: number;
  /** 自由英作文：下線の本数 */
  compositionLines?: number;
  /** 自由英作文：解答欄の長さ */
  compositionWidth?: "short" | "medium" | "long";
  /** 記号回答の表形式: 列数 */
  symbolTableCount?: number;
  /** 記号回答の表形式: 1行目の見出し */
  symbolTableHeader?: "numeric" | "alpha" | "exam";
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
  /** 過去問コーパス universities/{slug} との連動用 */
  pastExamSlug?: string;
}

/** 共通テスト得点（科目キー → 得点帯コード。constants/student-interview 参照） */
export type CommonTestScoreMap = Record<string, string>;

/** 面談で確定した構造化プロフィール（最新回のスナップショット。AI分析も参照） */
export interface StudentInterviewProfile {
  targetUniversities: TargetUniversityRef[];
  commonTestYear?: number;
  commonTestScores: CommonTestScoreMap;
  confirmedFactIds: string[];
  /** @deprecated 面談記録の studentConsultation / teacherAdvice を使用 */
  additionalNotes?: string;
  updatedAt?: Timestamp;
}

/** 1回分の面談記録（テスト返却のたびに追加） */
export interface StudentInterviewRecord {
  id: string;
  /** 面談実施日時 */
  conductedAt: Timestamp;
  /** 通算回数（1始まり） */
  recordNumber: number;
  /** 生徒からの相談・申し送り */
  studentConsultation: string;
  /** 教師が伝えたアドバイス・指示 */
  teacherAdvice: string;
  targetUniversities: TargetUniversityRef[];
  commonTestYear?: number;
  commonTestScores: CommonTestScoreMap;
  confirmedFactIds: string[];
  /** 関連する添削セッション（任意） */
  sessionId?: string;
  createdAt: Timestamp;
}

export interface Student {
  id: string;
  teacherId: string;
  name: string;
  course: string;
  targetUniversities: TargetUniversityRef[];
  interviewProfile?: StudentInterviewProfile;
  memo?: string;
  /** 閲覧専用で招待したメールアドレス（すべて小文字で保存）。成果物の閲覧のみ可・編集不可 */
  viewerEmails?: string[];
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
  /** 0 = 1枚目, 1 = 2枚目 …（解答用紙のページ） */
  pageIndex?: number;
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
  /** 小問ごとの配点（未指定時は大問配点を小問数で按分） */
  points?: number;
  answerFormat: AnswerSheetFormat;
  formatOptions?: AnswerFormatOptions;
  /** 未指定時は answerFormat / 問題文から自動判定 */
  gradingMode?: GradingMode;
  modelAnswer?: string;
  /** 日本語記述など小問ごとの採点基準（必須ポイント・方向性） */
  rubric?: string;
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
  /** 小問ラベル形式: (1)(2)… または (A)(B)… */
  partLabelScheme?: PartLabelScheme;
  /** 未指定時は answerFormat / 問題文から自動判定 */
  gradingMode?: GradingMode;
  prompt: string;
  modelAnswer: string;
  points: number;
  cropRegion: CropRegion;
  rubric?: string;
  /** 問題生成パイプライン（下書き昇格時に保存） */
  generationPipeline?: string;
}

export interface Test {
  id: string;
  teacherId: string;
  title: string;
  templateId: string;
  totalPoints: number;
  questionCount: number;
  universitySlug?: string;
  lastValidityReport?: import("./question-design").ValidityReport & { checkedAt?: unknown };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GradingProgress {
  current: number;
  total: number;
  message: string;
}

export interface Session {
  id: string;
  teacherId: string;
  studentId: string;
  testId: string;
  status: SessionStatus;
  sessionDate: Timestamp;
  sourceImagePath: string;
  sourceImagePaths?: string[];
  alignedImagePath?: string;
  alignedImagePaths?: string[];
  totalScore: number;
  maxScore: number;
  /** 100点満点換算の合計得点 */
  totalScore100?: number;
  gradingProgress?: GradingProgress;
  completedAt?: Timestamp;
  /** 教師が AI 添削内容を確認・確定した日時 */
  gradingConfirmedAt?: Timestamp;
  /** 生徒用返却プリントの内容が教師により確定された日時 */
  studentPrintFinalizedAt?: Timestamp;
  /** 教師が途中保存した日時（作業再開用） */
  draftSavedAt?: Timestamp;
  /** Gemini による過去問視点のアドバイス */
  pastExamAdvice?: import("./past-exam-advice").SessionPastExamAdvice;
  /** 教師が指定した手動切り出し（キー: "{order}-{partIndex}"） */
  manualCrops?: Record<
    string,
    {
      questionId: string;
      order: number;
      partIndex: number;
      partLabel?: string;
      cropRegion: CropRegion;
      croppedImagePath: string;
    }
  >;
}

export interface QuestionResult {
  id: string;
  questionId: string;
  order: number;
  partIndex?: number;
  partLabel?: string;
  type: QuestionType;
  /** 小問の解答形式（短答・記号など）。表示制御に使用 */
  answerFormat?: AnswerSheetFormat;
  /** 同一設問内の小問数（長文総合読解の判定用） */
  partCount?: number;
  /** 大問の answerFormat（composite 等） */
  questionAnswerFormat?: AnswerSheetFormat;
  croppedImagePath: string;
  /** 転記確認前は未採点のことがある */
  grade?: GradeLevel;
  score?: number;
  maxPoints: number;
  studentAnswerText?: string;
  transcriptionStatus?: TranscriptionStatus;
  transcriptionProfile?: string;
  graded?: boolean;
  feedback?: string;
  explanation?: string;
  modelAnswer: string;
  errorTags?: string[];
  teacherNotes?: string;
  /** 自由英作文: 内容の評価・解説 */
  contentEvaluation?: string;
  /** 自由英作文: 文法・語法の評価・解説 */
  grammarEvaluation?: string;
  /** 自由英作文: 完成版英文 */
  polishedAnswer?: string;
  teacherReviewed?: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
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

/** 多段カルテ分析: 根拠付き弱点（Stage 1） */
export interface KarteWeaknessItem {
  label: string;
  category: AdviceCard["category"];
  severity: "high" | "medium" | "low";
  trend: "improving" | "flat" | "worsening";
  errorTags?: string[];
  evidence?: string[];
}

/** 多段カルテ分析: 分野別到達度（Stage 2） */
export interface KarteSubjectReadiness {
  area: string;
  currentLevel?: string;
  targetLevel?: string;
  gapComment?: string;
}

/** 多段カルテ分析: 次回出題プラン（Stage 3） */
export interface KarteNextSessionPlan {
  focus?: string;
  recommendedQuestionTypes?: string[];
  drillSuggestions?: string[];
}

/** 多段カルテ分析: 整合チェック（Stage 4） */
export interface KarteIntegrityCheck {
  passed: boolean;
  violations?: string[];
  fabricationRisk?: string[];
}

/** 多段カルテ分析の各ステージ成果（schemaVersion >= 2 で付与） */
export interface KarteStages {
  diagnosis?: {
    weaknessSummary: string;
    weaknesses: KarteWeaknessItem[];
  };
  readiness?: {
    readinessComment: string;
    byArea: KarteSubjectReadiness[];
    priorityAreas: string[];
  };
  plan?: {
    adviceCards: AdviceCard[];
    nextSessionPlan: KarteNextSessionPlan;
  };
  integrity?: KarteIntegrityCheck;
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
  /** 多段分析のスキーマ版数（1=旧単発, 2=多段） */
  schemaVersion?: number;
  /** 教師レビュー状態（多段分析は draft で生成） */
  reviewStatus?: "draft" | "confirmed";
  /** 整合チェック（Stage 4）に通過したか */
  integrityPassed?: boolean;
  /** 整合チェックで検出された警告（志望校外への言及・捏造疑い等） */
  integrityWarnings?: string[];
  /** 各ステージの詳細成果（後方互換のため任意） */
  stages?: KarteStages;
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
  /** 時系列順・テストごとの一般化ミス傾向（第1回が先頭、下に増える） */
  errorTagsBySession?: Array<{
    order: number;
    sessionId: string;
    tags: Array<{ tag: string; count: number }>;
  }>;
  lastUpdated: Timestamp;
}
