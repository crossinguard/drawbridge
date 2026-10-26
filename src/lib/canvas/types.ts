/**
 * The domain model for a parsed Canvas course export.
 *
 * A Canvas course export is an IMS Common Cartridge: a ZIP of XML manifests
 * and HTML content. These types describe what the viewer needs to render a
 * course, independently of how the bytes were read.
 */

/** Publish state of a module, module item, or piece of content. */
export type PublishState = "active" | "unpublished" | "locked";

/** The kinds of content a Canvas module item can point at. */
export type ContentType =
  "assignment" | "quiz" | "page" | "discussion" | "external-url" | "external-tool" | "file" | "heading" | "unknown";

/** Human-readable names for the content kinds. */
export const KIND_LABELS: Record<ContentType, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  page: "Page",
  discussion: "Discussion",
  "external-url": "External link",
  "external-tool": "External tool",
  file: "File",
  heading: "Section heading",
  unknown: "Unknown",
};

/** Course-level metadata, mostly from `course_settings/`. */
export interface CourseMeta {
  /** Course title. */
  title: string;
  /** Course code — the short name shown next to the title in Canvas. */
  code: string;
  /** Root account name, e.g. a district or school. */
  accountName: string;
  /** The Canvas domain the export came from. */
  domain: string;
  /** Identifier of the Common Cartridge itself. */
  cartridgeId: string;
  /** Date the cartridge was produced, if the manifest records one. */
  exportedAt?: string;
  /** Path of the course image inside the cartridge, when one is set. */
  imagePath?: string;
  /** Name of the file or folder the course was loaded from. */
  sourceName: string;
}

/** One module (a "unit" in Canvas terms). */
export interface Module {
  id: string;
  title: string;
  position: number;
  state: PublishState;
  /** Whether students must complete items in order. */
  requireSequential: boolean;
  items: ModuleItem[];
}

/** One entry inside a module. */
export interface ModuleItem {
  id: string;
  title: string;
  contentType: ContentType;
  state: PublishState;
  /** 1-based order within the module. */
  position: number;
  /** Nesting depth inside the module. Canvas indents sub-headers. */
  indent: number;
  /** Target URL, for external links and external tools. */
  url?: string;
  /** Whether the link opened in a new tab in Canvas. */
  newTab?: boolean;
  /** Identifier of the content this item points at. */
  targetId?: string;
}

/** Where an item's body text comes from. */
export type BodySource =
  /** The body is an HTML file in the cartridge. */
  | "html"
  /** The body is HTML escaped inside a discussion's XML. */
  | "discussion"
  /** The body is HTML escaped inside a quiz's settings XML. */
  | "quiz-description";

/** Settings for an assignment, from `assignment_settings.xml`. */
export interface AssignmentDetails {
  pointsPossible?: number;
  gradingType?: string;
  submissionTypes: string[];
  dueAt?: string;
  unlockAt?: string;
  lockAt?: string;
  /** Identifier of the assignment group this belongs to. */
  groupId?: string;
  /** Title of the assignment group, resolved for display. */
  groupTitle?: string;
  workflowState?: string;
  peerReviews: boolean;
  peerReviewCount: number;
  omitFromFinalGrade: boolean;
  hideInGradebook: boolean;
  groupCategory: boolean;
  allowedExtensions: string[];
  /** `-1` means unlimited attempts. */
  allowedAttempts?: number;
  /** Identifier of the rubric attached to this assignment. */
  rubricId?: string;
  /** Whether the rubric drives the score, or is attached for reference only. */
  rubricUseForGrading: boolean;
  /** Whether the rubric's points are hidden from students. */
  rubricHidePoints: boolean;
  /** Whether the rubric's total score is hidden from students. */
  rubricHideScoreTotal: boolean;
  /** Whether the rubric's outcome results are hidden from students. */
  rubricHideOutcomeResults: boolean;
}

/**
 * Which Canvas quiz engine a quiz uses.
 *
 * - `classic` — a Classic Quiz. Its settings and questions are in the export.
 * - `new` — a New Quiz. The export carries a stub of it, not its settings.
 * - `survey` — a survey or graded survey, graded through the survey engine.
 * - `unknown` — the export does not say which engine it is.
 */
export type QuizEngine = "classic" | "new" | "survey" | "unknown";

/** How a quiz gets its questions. */
export type QuizContentSource = "items" | "banks" | "both" | "none";

/** How completely the export describes a quiz. */
export type QuizReadability = "complete" | "partial" | "stub";

/**
 * One selection a quiz records.
 *
 * Canvas writes a `<selection>` for every group of questions a quiz uses:
 * either a group of its own items, or a draw from a bank. The selection says
 * how many items are used and what each is worth, which is not always the
 * same as the points recorded on the items themselves.
 */
export interface QuizSelection {
  /** The bank the quiz draws from, when it draws from a bank. */
  bankId?: string;
  /** Title of the bank, when the export carries the bank file. */
  bankTitle?: string;
  /** How many items are used. Undefined when the export does not say. */
  count?: number;
  /** Points each item is worth. */
  pointsPerItem?: number;
  /** True when the export carries the bank file itself. */
  bankFilePresent: boolean;
  /** True when the selection does not say how many items it takes. */
  drawsAll?: boolean;
}

/** Settings for a quiz, from `assessment_meta.xml` and its QTI file. */
export interface QuizDetails {
  pointsPossible?: number;
  quizType?: string;
  /** `-1` means unlimited attempts. */
  allowedAttempts?: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  /** Time limit in minutes. */
  timeLimit?: number;
  dueAt?: string;
  unlockAt?: string;
  lockAt?: string;
  available: boolean;
  lockdownBrowser: boolean;
  /** Shared access code. A course export should not carry one. */
  accessCode?: string;
  showCorrectAnswers: boolean;
  scoringPolicy?: string;
  /** Number of questions found in the QTI payload. */
  questionCount: number;
  /** Canvas question types, with how many of each were found. */
  questionTypes: Record<string, number>;
  /** Points of the graded questions stored inside the quiz. */
  inlinePoints: number;
  /** Passages of text shown to the student, which are not graded. */
  textBlockCount: number;
  /** How many questions the quiz draws from its banks. */
  drawnCount?: number;
  /** Points the questions drawn from banks are worth. */
  bankPoints?: number;
  /** Points the quiz's selections add up to. */
  selectionPoints: number;
  /**
   * Points the quiz's questions are worth in total.
   *
   * Undefined when the export does not say how many questions a selection
   * takes, which makes the total impossible to work out.
   */
  pointsTotal?: number;
  /** True when a selection does not say how many items it uses. */
  selectionCountUnknown: boolean;
  /** Which Canvas quiz engine the quiz uses. */
  engine: QuizEngine;
  /** Whether the questions are in the quiz, in banks, or both. */
  contentSource: QuizContentSource;
  /** Every selection the quiz records, bank draws and own items alike. */
  selections: QuizSelection[];
  /** Whether students answer one question at a time. */
  oneQuestionAtATime: boolean;
  /** Whether the results are hidden from students. */
  hideResults: boolean;
  /** Identifier of the assignment group the quiz belongs to. */
  groupId?: string;
  /** Title of the assignment group, resolved for display. */
  groupTitle?: string;
  /** Identifier of the rubric attached to the quiz. */
  rubricId?: string;
  /** Whether the rubric drives the score. */
  rubricUseForGrading: boolean;
  /** Path of the file the settings came from. */
  settingsSource?: string;
  /** Path of the file the questions came from. */
  questionsSource?: string;
  /** How completely the export describes the quiz. */
  readability: QuizReadability;
}

/** Settings for a discussion, from the `topicMeta` sidecar. */
export interface DiscussionDetails {
  discussionType?: string;
  requireInitialPost: boolean;
  allowRating: boolean;
  anonymousState?: string;
  graded: boolean;
  /** Whether the discussion is graded, from the topic sidecar. */
  workflowState?: string;
  /** Points possible, for a graded discussion. */
  pointsPossible?: number;
  /** Identifier of the assignment group, for a graded discussion. */
  groupId?: string;
  /** Title of the assignment group, resolved for display. */
  groupTitle?: string;
  /** Identifier of the rubric attached to the discussion. */
  rubricId?: string;
  /** Whether the rubric drives the score. */
  rubricUseForGrading: boolean;
  /** Due date, for a graded discussion. */
  dueAt?: string;
}

/** Settings for a wiki page, from the `<meta>` tags in its HTML. */
export interface PageDetails {
  frontPage: boolean;
  editingRoles?: string;
  workflowState?: string;
}

/** A file carried in the cartridge's `web_resources` folder. */
export interface CourseFile {
  id: string;
  /** Path inside the cartridge. */
  path: string;
  displayName: string;
  /** Folder the file lives in, relative to `web_resources`. */
  folder?: string;
  hidden: boolean;
  /** Size in bytes, when the archive reports it. */
  size?: number;
  mimeType?: string;
}

/** A Canvas assignment group, with the weight used for grading. */
export interface AssignmentGroup {
  id: string;
  title: string;
  position: number;
  /** Share of the final grade, as a percentage. */
  weight: number;
}

/** The course's late- and missing-submission policy. */
export interface LatePolicy {
  missingSubmissionDeductionEnabled: boolean;
  missingSubmissionDeduction: number;
  lateSubmissionDeductionEnabled: boolean;
  lateSubmissionDeduction: number;
  lateSubmissionInterval?: string;
  lateSubmissionMinimumPercentEnabled: boolean;
  lateSubmissionMinimumPercent: number;
}

/** Course-wide settings, from `course_settings.xml`. */
export interface CourseSettings {
  /** Raw key/value pairs, so nothing is lost. */
  [key: string]: string | number | boolean | undefined;
}

/** One rating level of a rubric criterion. */
export interface RubricRating {
  /** Canvas' identifier for the level. `blank` and `blank_2` are the two ends. */
  id: string;
  /** The level's name, e.g. "Exemplary". */
  description: string;
  /** What the level means. */
  longDescription: string;
  /** Points the level is worth. */
  points?: number;
}

/** One criterion of a rubric. */
export interface RubricCriterion {
  id: string;
  /** The criterion's name, e.g. "Formatting and Length". */
  description: string;
  /** What the criterion asks for. */
  longDescription: string;
  /** Points the criterion is worth. */
  points?: number;
  /**
   * True when the levels describe a range rather than fixed point values.
   * Canvas calls this "use range for grading".
   */
  useRange: boolean;
  ratings: RubricRating[];
}

/** A rubric, from `course_settings/rubrics.xml`. */
export interface Rubric {
  id: string;
  title: string;
  /** The rubric's stated total. */
  pointsPossible?: number;
  criteria: RubricCriterion[];
  /** Whether the rubric can be attached to more than one assignment. */
  reusable: boolean;
  /** Whether the rubric is locked against editing. */
  readOnly: boolean;
}

/**
 * A question bank carried in the export.
 *
 * The bank holds reusable questions. The viewer records how many items it
 * holds and which quizzes draw from it, but never reads the items themselves.
 */
export interface ItemBank {
  id: string;
  /** The bank's name, from its own metadata. */
  title: string;
  /** How many items the bank file holds. */
  itemCount: number;
  /** Path of the bank's QTI file. */
  path: string;
  /** Identifiers of the quizzes that draw from this bank. */
  usedBy: string[];
}

/** A file the viewer could not read. */
export interface UnreadableFile {
  /** Path inside the cartridge. */
  path: string;
  /** Why it could not be read. */
  reason: string;
}

/**
 * One piece of content in the export.
 *
 * A single shape covers every content type so the browse table and the
 * inventory CSV can treat them uniformly; `kind` says which of the optional
 * detail objects is populated.
 */
export interface CourseItem {
  /** The resource identifier from the cartridge manifest. */
  id: string;
  kind: ContentType;
  title: string;
  /**
   * The title the content carries itself, when it differs from the title the
   * module item shows. Canvas lets the two drift apart.
   */
  ownTitle?: string;
  state: PublishState;
  /** Path of the body HTML inside the cartridge. */
  bodyPath?: string;
  /** How the body is stored, so it can be read the right way. */
  bodySource?: BodySource;
  /** Path of the settings XML inside the cartridge. */
  settingsPath?: string;
  /** External URL, for links and external tools. */
  url?: string;
  newTab?: boolean;
  /** Module the item belongs to, when it is in one. */
  moduleId?: string;
  moduleTitle?: string;
  moduleState?: PublishState;
  /** The module item that points at this content. */
  itemId?: string;
  position?: number;
  indent?: number;
  assignment?: AssignmentDetails;
  quiz?: QuizDetails;
  discussion?: DiscussionDetails;
  page?: PageDetails;
  /** True when a module item could not be resolved to any resource. */
  unresolved?: boolean;
  /** Why it could not be resolved. */
  unresolvedReason?: string;
}

/** Everything the viewer knows about one course export. */
export interface CourseExport {
  meta: CourseMeta;
  modules: Module[];
  /** Content that a module points at, in module order. */
  items: CourseItem[];
  /** Content present in the export but not placed in any module. */
  orphans: CourseItem[];
  files: CourseFile[];
  assignmentGroups: AssignmentGroup[];
  settings: CourseSettings;
  latePolicy?: LatePolicy;
  /** Every rubric in the export. */
  rubrics: Rubric[];
  /** Every question bank in the export. */
  itemBanks: ItemBank[];
  /** Paths of the files the viewer read. */
  filesRead: string[];
  /** Files that could not be read. */
  unreadable: UnreadableFile[];
  /** Non-fatal problems hit while reading the cartridge. */
  warnings: string[];
}
