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
  "assignment" | "quiz" | "page" | "discussion" | "external-url" | "external-tool" | "file" | "unknown";

/** Human-readable names for the content kinds. */
export const KIND_LABELS: Record<ContentType, string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  page: "Page",
  discussion: "Discussion",
  "external-url": "External link",
  "external-tool": "External tool",
  file: "File",
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
  state: PublishState;
  /** Path of the body HTML inside the cartridge. */
  bodyPath?: string;
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
  /** Non-fatal problems hit while reading the cartridge. */
  warnings: string[];
}
