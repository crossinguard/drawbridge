/**
 * Reading a Canvas course export into a course the viewer can browse.
 *
 * A Canvas export is an IMS Common Cartridge. The pieces that matter are:
 *
 * - `imsmanifest.xml` — the resource list and the module organization.
 * - `course_settings/module_meta.xml` — the modules and their items.
 * - `course_settings/course_settings.xml` — the course settings.
 * - `course_settings/rubrics.xml` — every rubric in the course.
 * - one folder per assignment, quiz, or discussion.
 * - `wiki_content/` — the pages.
 *
 * The join between a module item and the content it points at runs through
 * the manifest: a module item's identifier matches an `<item>` in the
 * manifest's organization, whose `identifierref` names a `<resource>`. The
 * module's own `identifierref` cannot be trusted — for external links Canvas
 * writes the item's own identifier there instead of the resource identifier.
 *
 * A quiz is the awkward case. Canvas writes two resources for one classic
 * quiz: one holds the question stub, the other holds the settings and the
 * real questions, and the first depends on the second. The parser therefore
 * indexes assessments by the folder they live in and follows the dependency,
 * rather than guessing paths.
 */
import { processContent, type ProcessedContent } from "./content";
import type { FileStore } from "./store";
import {
  allElements,
  childElement,
  childElements,
  childNumber,
  childText,
  childTexts,
  descendantElements,
  hasBrokenNamespace,
  parseXml,
  textOf,
} from "./xml";
import type {
  AssignmentDetails,
  AssignmentGroup,
  ContentType,
  CourseExport,
  CourseFile,
  CourseItem,
  CourseMeta,
  CourseSettings,
  DiscussionDetails,
  ItemBank,
  LatePolicy,
  Module,
  ModuleItem,
  PageDetails,
  PublishState,
  QuizDetails,
  QuizEngine,
  QuizSelection,
  Rubric,
  RubricCriterion,
  RubricRating,
  UnreadableFile,
} from "./types";

/** A resource declared in the cartridge manifest. */
interface Resource {
  id: string;
  type: string;
  href: string;
  files: string[];
  dependencies: string[];
}

/** An item in the manifest's organization tree. */
interface OrganizationItem {
  identifierref?: string;
  title: string;
}

/** A parsed course: its structure, plus the processed text of every item. */
export interface ParsedCourse {
  export: CourseExport;
  /** Processed body content, keyed by item id. */
  content: Map<string, ProcessedContent>;
}

/** Options for {@link parseCourseExport}. */
export interface ParseOptions {
  /** Name of the file the course was read from. */
  sourceName: string;
}

// ---------------------------------------------------------------------------
// Reading files
// ---------------------------------------------------------------------------

/**
 * Reads the cartridge's files and keeps a record of what was read.
 *
 * The record matters twice over: the review report has to say which files it
 * read, and it has to list the files it could not read rather than quietly
 * carrying on without them.
 */
class Reader {
  /** Paths of the files that were read. */
  readonly read: string[] = [];
  /** Files that could not be read, and why. */
  readonly unreadable: UnreadableFile[] = [];

  private readonly seen = new Set<string>();

  constructor(private readonly store: FileStore) {}

  /** Read a file as text, recording it. */
  async text(path: string): Promise<string | undefined> {
    let source: string | undefined;
    try {
      source = await this.store.text(path);
    } catch (error) {
      this.unreadable.push({ path, reason: describe(error) });
      return undefined;
    }

    if (source === undefined) return undefined;

    if (!this.seen.has(path)) {
      this.seen.add(path);
      this.read.push(path);
    }
    return source;
  }

  /** Read and parse an XML file, recording a failure rather than throwing. */
  async xml(path: string, warnings: string[]): Promise<Document | undefined> {
    const source = await this.text(path);
    if (source === undefined) return undefined;

    try {
      if (hasBrokenNamespace(source)) {
        warnings.push(`${path} declares its XML namespace incorrectly. It was repaired so the file could be read.`);
      }
      return parseXml(source, path);
    } catch (error) {
      this.unreadable.push({ path, reason: describe(error) });
      return undefined;
    }
  }
}

/** A readable description of a thrown error. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * True when a child element is there, whatever its text says.
 *
 * Canvas writes some settings as an empty element when they are on, and
 * leaves them out when they are off.
 */
function childPresent(parent: Element | Document, localName: string): boolean {
  return childElement(parent, localName) !== undefined;
}

/**
 * Parse one of the export's XML files, noting when it had to be repaired.
 *
 * Some Canvas exports declare their XML schema namespace incorrectly, which
 * browsers refuse. The file is still readable once the declaration is fixed,
 * but it is worth telling the reviewer about.
 */
function parseSettingsXml(source: string, label: string, warnings: string[]): Document {
  if (hasBrokenNamespace(source)) {
    warnings.push(`${label} declares its XML namespace incorrectly. It was repaired so the file could be read.`);
  }
  return parseXml(source, label);
}

/** The file extension to MIME type map, for the file list. */
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html",
};

/**
 * Read a course export.
 *
 * @throws When the cartridge has no manifest, or its manifest is malformed.
 */
export async function parseCourseExport(store: FileStore, options: ParseOptions): Promise<ParsedCourse> {
  const reader = new Reader(store);
  const warnings: string[] = [];

  const manifestText = await reader.text("imsmanifest.xml");
  if (manifestText === undefined) {
    throw new Error("This export has no imsmanifest.xml, so it is not a Canvas course export.");
  }

  const manifest = parseXml(manifestText, "imsmanifest.xml");
  const resources = readResources(manifest);
  const organizationItems = readOrganizationItems(manifest);

  const entries = indexAssessments(resources);
  const assessments = await readAssessments(reader, entries, warnings);
  const banks = indexBanks(assessments);

  const settingsFiles = await readSettingsFiles(reader, warnings);
  const meta = readMeta(manifest, settingsFiles, options.sourceName, resources, warnings);
  const settings = readCourseSettings(settingsFiles.courseSettings, warnings);
  const assignmentGroups = readAssignmentGroups(settingsFiles.assignmentGroups, warnings);
  const latePolicy = readLatePolicy(settingsFiles.latePolicy, warnings);
  const rubrics = readRubrics(settingsFiles.rubrics, warnings);
  const groupTitles = new Map(assignmentGroups.map((group) => [group.id, group.title]));

  const modules = readModules(settingsFiles.moduleMeta, warnings);
  const { items, orphans } = await buildContent(
    reader,
    modules,
    resources,
    organizationItems,
    entries,
    assessments,
    banks,
    groupTitles,
    warnings,
  );

  const itemBanks = buildItemBanks(banks, [...items, ...orphans]);

  const courseExport: CourseExport = {
    meta,
    modules,
    items,
    orphans,
    files: readFiles(store, resources, settingsFiles.filesMeta),
    assignmentGroups,
    settings,
    latePolicy,
    rubrics,
    itemBanks,
    filesRead: reader.read,
    unreadable: reader.unreadable,
    warnings,
  };

  const content = await buildContentIndex(store, courseExport, meta.domain);
  return { export: courseExport, content };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/** Read the `<resource>` list from the manifest. */
function readResources(manifest: Document): Map<string, Resource> {
  const resources = new Map<string, Resource>();

  for (const element of descendantElements(manifest, "resource")) {
    const id = element.getAttribute("identifier");
    if (!id) continue;

    resources.set(id, {
      id,
      type: element.getAttribute("type") ?? "",
      href: element.getAttribute("href") ?? "",
      files: childElements(element, "file")
        .map((file) => file.getAttribute("href") ?? "")
        .filter((href) => href !== ""),
      dependencies: childElements(element, "dependency")
        .map((dependency) => dependency.getAttribute("identifierref") ?? "")
        .filter((identifierref) => identifierref !== ""),
    });
  }

  return resources;
}

/** Read the manifest's organization tree into a lookup by item identifier. */
function readOrganizationItems(manifest: Document): Map<string, OrganizationItem> {
  const items = new Map<string, OrganizationItem>();

  const collect = (parent: Element): void => {
    for (const item of childElements(parent, "item")) {
      const id = item.getAttribute("identifier");
      if (!id) continue;

      items.set(id, {
        identifierref: item.getAttribute("identifierref") ?? undefined,
        title: childText(item, "title"),
      });

      collect(item);
    }
  };

  for (const organizations of childElements(manifest, "organizations")) {
    for (const organization of childElements(organizations, "organization")) {
      collect(organization);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

/** What the manifest says about one assessment folder. */
interface AssessmentEntry {
  /** The folder the assessment lives in, e.g. `g5fe32c0…`. */
  folder: string;
  /** Path of the settings file, when the export has one. */
  metaPath?: string;
  /** Every QTI file the manifest lists for this assessment. */
  qtiPaths: string[];
}

/** What was read out of one assessment. */
interface AssessmentData {
  folder: string;
  /** True when the QTI is a question bank rather than a quiz. */
  isBank: boolean;
  /** The QTI file the questions were read from. */
  qtiPath?: string;
  /** The title the assessment carries. */
  title?: string;
  /** Counts of the questions stored inside the assessment. */
  questionTypes: Record<string, number>;
  /** How many questions are stored inside the assessment. */
  questionCount: number;
  /** Points of the questions stored inside the assessment. */
  inlinePoints: number;
  /** The selections the assessment records. */
  selections: QuizSelection[];
  /** How many items the bank holds. */
  bankItemCount: number;
  /** Passages of text shown to the student, which are not graded. */
  textBlockCount: number;
  /** The settings read from the settings file. */
  settings?: RawQuizSettings;
  /** Path of the settings file. */
  settingsPath?: string;
}

/** The settings a quiz's settings file records. */
interface RawQuizSettings {
  title?: string;
  /** The quiz's instructions, as HTML. */
  description?: string;
  pointsPossible?: number;
  quizType?: string;
  allowedAttempts?: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  timeLimit?: number;
  dueAt?: string;
  unlockAt?: string;
  lockAt?: string;
  available: boolean;
  lockdownBrowser: boolean;
  accessCode?: string;
  showCorrectAnswers: boolean;
  scoringPolicy?: string;
  oneQuestionAtATime: boolean;
  hideResults: boolean;
  groupId?: string;
  rubricId?: string;
  rubricUseForGrading: boolean;
}

/**
 * Index the assessments the manifest mentions.
 *
 * An assessment is identified by the folder it lives in. The questions may
 * live beside the settings, in `non_cc_assessments`, or in both — the parser
 * keeps every candidate and later picks the one that holds the questions.
 */
function indexAssessments(resources: Map<string, Resource>): Map<string, AssessmentEntry> {
  const entries = new Map<string, AssessmentEntry>();

  const entryFor = (folder: string): AssessmentEntry => {
    const found = entries.get(folder);
    if (found) return found;
    const created: AssessmentEntry = { folder, qtiPaths: [] };
    entries.set(folder, created);
    return created;
  };

  const note = (path: string): void => {
    const folder = folderOfPath(path);
    if (!folder) return;

    const entry = entryFor(folder);
    if (path.endsWith("/assessment_meta.xml")) {
      entry.metaPath ??= path;
      return;
    }
    if (path.endsWith(".qti") && !entry.qtiPaths.includes(path)) {
      entry.qtiPaths.push(path);
    }
  };

  for (const resource of resources.values()) {
    note(resource.href);
    for (const file of resource.files) note(file);
  }

  return entries;
}

/**
 * The folder an assessment lives in, from one of its paths.
 *
 * Canvas writes quizzes as `g<id>/assessment_meta.xml` and
 * `g<id>/assessment_qti.xml`, and the real questions as
 * `non_cc_assessments/<id>.xml.qti`. The folder name is the same in all
 * three, which is what makes the join possible.
 */
function folderOfPath(path: string): string | undefined {
  const nonCc = /^non_cc_assessments\/(.+)\.xml\.qti$/.exec(path);
  if (nonCc) return nonCc[1];

  if (path.endsWith("/assessment_meta.xml") || path.endsWith("/assessment_qti.xml")) {
    return path.slice(0, path.indexOf("/"));
  }

  return undefined;
}

/** The assessment folder a resource points at, when it points at one. */
function folderOfResource(resource: Resource): string | undefined {
  for (const file of resource.files) {
    const folder = folderOfPath(file);
    if (folder) return folder;
  }
  return folderOfPath(resource.href);
}

/** Read every assessment the manifest mentions. */
async function readAssessments(
  reader: Reader,
  entries: Map<string, AssessmentEntry>,
  warnings: string[],
): Promise<Map<string, AssessmentData>> {
  const assessments = new Map<string, AssessmentData>();

  for (const entry of entries.values()) {
    const data = await readAssessment(reader, entry, warnings);
    if (data) assessments.set(entry.folder, data);
  }

  return assessments;
}

/** Read one assessment: its questions, and its settings when it has them. */
async function readAssessment(
  reader: Reader,
  entry: AssessmentEntry,
  warnings: string[],
): Promise<AssessmentData | undefined> {
  const data: AssessmentData = {
    folder: entry.folder,
    isBank: false,
    questionTypes: {},
    questionCount: 0,
    inlinePoints: 0,
    textBlockCount: 0,
    selections: [],
    bankItemCount: 0,
  };

  // The settings file, when the export has one.
  if (entry.metaPath) {
    const doc = await reader.xml(entry.metaPath, warnings);
    if (doc) {
      const settings = readQuizSettings(doc);
      if (settings) {
        data.settings = settings;
        data.settingsPath = entry.metaPath;
      }
    }
  }

  // The questions. Canvas may write them in more than one place, and only
  // one of those places holds them.
  let best: { path: string; weight: number } | undefined;

  for (const path of entry.qtiPaths) {
    const doc = await reader.xml(path, warnings);
    if (!doc) continue;

    const bank = childElement(doc, "objectbank");
    const assessment = childElement(doc, "assessment");

    if (bank) {
      data.isBank = true;
      data.bankItemCount = descendantElements(bank, "item").length;
      data.title = readBankTitle(bank);
      data.qtiPath = path;
      break;
    }

    if (!assessment) continue;

    const questions = readQuestions(assessment);
    const weight = questions.count + questions.selections.length;

    if (!best || weight > best.weight) {
      best = { path, weight };
      data.qtiPath = path;
      data.title = assessment.getAttribute("title")?.trim() || data.title;
      data.questionTypes = questions.types;
      data.questionCount = questions.count;
      data.inlinePoints = questions.points;
      data.textBlockCount = questions.textBlocks;
      data.selections = questions.selections;
    }
  }

  if (!data.qtiPath && !data.settings) return undefined;
  return data;
}

/** The name a question bank gives itself. */
function readBankTitle(bank: Element): string | undefined {
  for (const field of descendantElements(bank, "qtimetadatafield")) {
    if (childText(field, "fieldlabel") === "bank_title") {
      const title = childText(field, "fieldentry");
      if (title) return title;
    }
  }
  return undefined;
}

/** The questions stored inside a quiz, and the selections it makes. */
function readQuestions(assessment: Element): {
  count: number;
  textBlocks: number;
  types: Record<string, number>;
  points: number;
  selections: QuizSelection[];
} {
  const types: Record<string, number> = {};
  let count = 0;
  let textBlocks = 0;
  let points = 0;

  for (const item of descendantElements(assessment, "item")) {
    const type = readQuestionType(item);

    // A text-only question is a passage shown to the student, not something
    // they answer. It carries a placeholder point value in the export but is
    // not graded, so it is counted apart and left out of the points.
    if (type === "text_only_question") {
      textBlocks++;
      continue;
    }

    count++;
    if (type) types[type] = (types[type] ?? 0) + 1;
    points += readItemPoints(item) ?? 0;
  }

  const selections: QuizSelection[] = [];

  for (const selection of descendantElements(assessment, "selection")) {
    const extension = childElement(selection, "selection_extension");
    const pointsPerItem = extension ? childNumber(extension, "points_per_item") : undefined;
    const bankId = childText(selection, "sourcebank_ref");
    const count = childNumber(selection, "selection_number");

    selections.push({
      bankId: bankId || undefined,
      count,
      pointsPerItem,
      bankFilePresent: false,
      // A selection with no number does not say how many questions it takes.
      drawsAll: Boolean(bankId) && count === undefined,
    });
  }

  return { count, textBlocks, types, points, selections };
}

/** The points one QTI item is worth. */
function readItemPoints(item: Element): number | undefined {
  for (const field of descendantElements(item, "qtimetadatafield")) {
    if (childText(field, "fieldlabel") === "points_possible") {
      const points = Number(childText(field, "fieldentry"));
      return Number.isFinite(points) ? points : undefined;
    }
  }
  return undefined;
}

/** The Canvas question type of one QTI item. */
function readQuestionType(item: Element): string | undefined {
  for (const field of descendantElements(item, "qtimetadatafield")) {
    if (childText(field, "fieldlabel") === "question_type") {
      return childText(field, "fieldentry") || undefined;
    }
  }
  return undefined;
}

/** Read a quiz's settings file. */
function readQuizSettings(doc: Document): RawQuizSettings | undefined {
  const quiz = childElement(doc, "quiz") ?? doc.documentElement;
  if (!quiz) return undefined;

  const assignment = childElement(quiz, "assignment");
  const groupId = assignment ? childText(assignment, "assignment_group_identifierref") : "";

  return {
    title: childText(quiz, "title") || undefined,
    description: childText(quiz, "description") || undefined,
    pointsPossible: childNumber(quiz, "points_possible") ?? childNumber(assignment ?? quiz, "points_possible"),
    quizType: childText(quiz, "quiz_type") || undefined,
    allowedAttempts: childNumber(quiz, "allowed_attempts"),
    shuffleQuestions: childText(quiz, "shuffle_questions") === "true",
    shuffleAnswers: childText(quiz, "shuffle_answers") === "true",
    timeLimit: childNumber(quiz, "time_limit"),
    dueAt: childText(quiz, "due_at") || undefined,
    unlockAt: childText(quiz, "unlock_at") || undefined,
    lockAt: childText(quiz, "lock_at") || undefined,
    available: childText(quiz, "available") === "true",
    lockdownBrowser: childText(quiz, "require_lockdown_browser") === "true",
    accessCode: childText(quiz, "access_code") || undefined,
    showCorrectAnswers: childText(quiz, "show_correct_answers") === "true",
    scoringPolicy: childText(quiz, "scoring_policy") || undefined,
    oneQuestionAtATime: childText(quiz, "one_question_at_a_time") === "true",
    hideResults: childPresent(quiz, "hide_results"),
    groupId: groupId || undefined,
    rubricId: (assignment ? childText(assignment, "rubric_identifierref") : "") || undefined,
    rubricUseForGrading: assignment ? childText(assignment, "rubric_use_for_grading") === "true" : false,
  };
}

// ---------------------------------------------------------------------------
// course_settings
// ---------------------------------------------------------------------------

/** The raw text of every `course_settings` file the viewer understands. */
interface SettingsFiles {
  courseSettings?: string;
  moduleMeta?: string;
  assignmentGroups?: string;
  filesMeta?: string;
  latePolicy?: string;
  context?: string;
  rubrics?: string;
}

/** Read the `course_settings` files. */
async function readSettingsFiles(reader: Reader, warnings: string[]): Promise<SettingsFiles> {
  const names = [
    ["courseSettings", "course_settings/course_settings.xml"],
    ["moduleMeta", "course_settings/module_meta.xml"],
    ["assignmentGroups", "course_settings/assignment_groups.xml"],
    ["filesMeta", "course_settings/files_meta.xml"],
    ["latePolicy", "course_settings/late_policy.xml"],
    ["context", "course_settings/context.xml"],
    ["rubrics", "course_settings/rubrics.xml"],
  ] as const;

  const entries = await Promise.all(names.map(async ([key, path]) => [key, await reader.text(path)] as const));
  const files = Object.fromEntries(entries) as Record<keyof SettingsFiles, string | undefined>;

  for (const [key, path] of names) {
    if (files[key] === undefined) warnings.push(`${path} is missing from the export.`);
  }

  return files;
}

/** Read the course's identity and provenance. */
function readMeta(
  manifest: Document,
  files: SettingsFiles,
  sourceName: string,
  resources: Map<string, Resource>,
  warnings: string[],
): CourseMeta {
  let title = readManifestTitle(manifest);
  let code = "";
  let accountName = "";
  let domain = "";
  let exportedAt: string | undefined;
  let imagePath: string | undefined;

  if (files.courseSettings) {
    const doc = parseSettingsXml(files.courseSettings, "course_settings.xml", warnings);
    const course = childElement(doc, "course");
    if (course) {
      title = childText(course, "title") || title;
      code = childText(course, "course_code");
      const imageRef = childText(course, "image_identifier_ref");
      if (imageRef) {
        const resource = resources.get(imageRef);
        if (resource?.href) imagePath = resource.href;
      }
    }
  }

  if (files.context) {
    const doc = parseSettingsXml(files.context, "context.xml", warnings);
    const context = childElement(doc, "context_info");
    if (context) {
      accountName = childText(context, "root_account_name");
      domain = childText(context, "canvas_domain");
      if (!title) title = childText(context, "course_name");
    }
  }

  exportedAt = readManifestDate(manifest);

  return {
    title: title || "Untitled course",
    code,
    accountName,
    domain,
    cartridgeId: manifest.documentElement.getAttribute("identifier") ?? "",
    exportedAt,
    imagePath,
    sourceName,
  };
}

/** The title the manifest's LOM metadata records. */
function readManifestTitle(manifest: Document): string {
  const lom = descendantElements(manifest, "lom")[0];
  if (!lom) return "";
  const general = descendantElements(lom, "general")[0];
  if (!general) return "";
  return childText(general, "title");
}

/** The date the manifest's LOM metadata records. */
function readManifestDate(manifest: Document): string | undefined {
  const lom = descendantElements(manifest, "lom")[0];
  if (!lom) return undefined;
  const contribute = descendantElements(lom, "contribute")[0];
  if (!contribute) return undefined;
  const date = descendantElements(contribute, "date")[0];
  if (!date) return undefined;
  return childText(date, "dateTime") || undefined;
}

/** Read every course setting as a flat map of strings. */
function readCourseSettings(source: string | undefined, warnings: string[]): CourseSettings {
  const settings: CourseSettings = {};
  if (!source) return settings;

  const doc = parseSettingsXml(source, "course_settings.xml", warnings);
  const course = childElement(doc, "course");
  if (!course) return settings;

  for (const element of Array.from(course.children)) {
    settings[element.localName] = (element.textContent ?? "").trim();
  }

  return settings;
}

/** Read the assignment groups and their weights. */
function readAssignmentGroups(source: string | undefined, warnings: string[]): AssignmentGroup[] {
  if (!source) return [];

  const doc = parseSettingsXml(source, "assignment_groups.xml", warnings);
  return childElements(doc, "assignmentGroup").map((element) => ({
    id: element.getAttribute("identifier") ?? "",
    title: childText(element, "title"),
    position: childNumber(element, "position") ?? 0,
    weight: childNumber(element, "group_weight") ?? 0,
  }));
}

/** Read the late submission policy. */
function readLatePolicy(source: string | undefined, warnings: string[]): LatePolicy | undefined {
  if (!source) return undefined;

  const doc = parseSettingsXml(source, "late_policy.xml", warnings);
  const policy = childElement(doc, "late_policy");
  if (!policy) return undefined;

  return {
    missingSubmissionDeductionEnabled: childText(policy, "missing_submission_deduction_enabled") === "true",
    missingSubmissionDeduction: childNumber(policy, "missing_submission_deduction") ?? 0,
    lateSubmissionDeductionEnabled: childText(policy, "late_submission_deduction_enabled") === "true",
    lateSubmissionDeduction: childNumber(policy, "late_submission_deduction") ?? 0,
    lateSubmissionInterval: childText(policy, "late_submission_interval") || undefined,
    lateSubmissionMinimumPercentEnabled: childText(policy, "late_submission_minimum_percent_enabled") === "true",
    lateSubmissionMinimumPercent: childNumber(policy, "late_submission_minimum_percent") ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------

/** Read every rubric in the course. */
function readRubrics(source: string | undefined, warnings: string[]): Rubric[] {
  if (!source) return [];

  const doc = parseSettingsXml(source, "rubrics.xml", warnings);

  return childElements(doc, "rubric").map((element) => ({
    id: element.getAttribute("identifier") ?? "",
    title: childText(element, "title"),
    pointsPossible: childNumber(element, "points_possible"),
    reusable: childText(element, "reusable") === "true",
    readOnly: childText(element, "read_only") === "true",
    criteria: readRubricCriteria(element),
  }));
}

/** Read the criteria of a rubric. */
function readRubricCriteria(rubric: Element): RubricCriterion[] {
  const criteria = childElement(rubric, "criteria");
  if (!criteria) return [];

  return childElements(criteria, "criterion").map((criterion) => ({
    id: childText(criterion, "criterion_id"),
    description: childText(criterion, "description"),
    longDescription: childText(criterion, "long_description"),
    points: childNumber(criterion, "points"),
    useRange: childText(criterion, "criterion_use_range") === "true",
    ratings: readRubricRatings(criterion),
  }));
}

/** Read the rating levels of a rubric criterion. */
function readRubricRatings(criterion: Element): RubricRating[] {
  const ratings = childElement(criterion, "ratings");
  if (!ratings) return [];

  return childElements(ratings, "rating").map((rating) => ({
    id: childText(rating, "id"),
    description: childText(rating, "description"),
    longDescription: childText(rating, "long_description"),
    points: childNumber(rating, "points"),
  }));
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/** Read the modules and their items. */
function readModules(source: string | undefined, warnings: string[]): Module[] {
  if (!source) return [];

  const doc = parseSettingsXml(source, "module_meta.xml", warnings);

  return childElements(doc, "module")
    .map((element) => {
      const itemsElement = childElement(element, "items");
      const items: ModuleItem[] = itemsElement
        ? childElements(itemsElement, "item").map((item) => ({
            id: item.getAttribute("identifier") ?? "",
            title: childText(item, "title"),
            contentType: canvasContentType(childText(item, "content_type")),
            state: publishState(childText(item, "workflow_state")),
            position: childNumber(item, "position") ?? 0,
            indent: childNumber(item, "indent") ?? 0,
            url: childText(item, "url") || undefined,
            newTab: childText(item, "new_tab") === "true",
            targetId: childText(item, "identifierref") || undefined,
          }))
        : [];

      return {
        id: element.getAttribute("identifier") ?? "",
        title: childText(element, "title"),
        position: childNumber(element, "position") ?? 0,
        state: publishState(childText(element, "workflow_state")),
        requireSequential: childText(element, "require_sequential_progress") === "true",
        items,
      };
    })
    .sort((a, b) => a.position - b.position);
}

/** Map a Canvas `content_type` onto a content kind. */
function canvasContentType(value: string): ContentType {
  switch (value) {
    case "Assignment":
      return "assignment";
    case "Quizzes::Quiz":
      return "quiz";
    case "WikiPage":
      return "page";
    case "DiscussionTopic":
      return "discussion";
    case "ExternalUrl":
      return "external-url";
    case "ContextExternalTool":
      return "external-tool";
    case "File":
      return "file";
    case "ContextModuleSubHeader":
      return "heading";
    default:
      return "unknown";
  }
}

/** Map a Canvas `workflow_state` onto a publish state. */
function publishState(value: string): PublishState {
  if (value === "unpublished") return "unpublished";
  if (value === "locked") return "locked";
  return "active";
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** Resolve every module item to the content it points at. */
async function buildContent(
  reader: Reader,
  modules: Module[],
  resources: Map<string, Resource>,
  organizationItems: Map<string, OrganizationItem>,
  entries: Map<string, AssessmentEntry>,
  assessments: Map<string, AssessmentData>,
  banks: Map<string, ItemBank>,
  groupTitles: Map<string, string>,
  warnings: string[],
): Promise<{ items: CourseItem[]; orphans: CourseItem[] }> {
  const items: CourseItem[] = [];
  const used = new Set<string>();

  for (const module of modules) {
    for (const moduleItem of module.items) {
      const resourceId = resolveResourceId(moduleItem, organizationItems, resources);
      const item = await buildItem(
        reader,
        moduleItem,
        module,
        resourceId,
        resources,
        entries,
        assessments,
        banks,
        groupTitles,
        warnings,
      );
      items.push(item);
      if (resourceId) used.add(resourceId);
    }
  }

  const orphans = await buildOrphans(reader, resources, used, assessments, banks, groupTitles);
  return { items, orphans };
}

/**
 * Find the resource a module item points at.
 *
 * The manifest's organization is the reliable path; the module's own
 * `identifierref` is only a fallback, because Canvas writes the item's
 * identifier there for external links.
 */
function resolveResourceId(
  item: ModuleItem,
  organizationItems: Map<string, OrganizationItem>,
  resources: Map<string, Resource>,
): string | undefined {
  const viaOrganization = organizationItems.get(item.id)?.identifierref;
  if (viaOrganization && resources.has(viaOrganization)) return viaOrganization;
  if (item.targetId && resources.has(item.targetId)) return item.targetId;
  return undefined;
}

/** Build the content record for one module item. */
async function buildItem(
  reader: Reader,
  moduleItem: ModuleItem,
  module: Module,
  resourceId: string | undefined,
  resources: Map<string, Resource>,
  entries: Map<string, AssessmentEntry>,
  assessments: Map<string, AssessmentData>,
  banks: Map<string, ItemBank>,
  groupTitles: Map<string, string>,
  warnings: string[],
): Promise<CourseItem> {
  const base: CourseItem = {
    id: resourceId ?? moduleItem.id,
    kind: moduleItem.contentType,
    title: moduleItem.title,
    state: moduleItem.state,
    url: moduleItem.url,
    newTab: moduleItem.newTab,
    moduleId: module.id,
    moduleTitle: module.title,
    moduleState: module.state,
    itemId: moduleItem.id,
    position: moduleItem.position,
    indent: moduleItem.indent,
  };

  // A section heading divides a module up. It is not a piece of content and
  // has nothing in the manifest.
  if (moduleItem.contentType === "heading") {
    return {
      ...base,
      unresolved: true,
      unresolvedReason: "This is a section heading in the module, not a piece of content.",
    };
  }

  if (!resourceId) {
    return {
      ...base,
      unresolved: true,
      unresolvedReason: "This item has no matching entry in the cartridge manifest.",
    };
  }

  const resource = resources.get(resourceId);
  if (!resource) {
    return { ...base, unresolved: true, unresolvedReason: "The manifest entry could not be read." };
  }

  const kind = moduleItem.contentType === "unknown" ? kindFromResource(resource) : moduleItem.contentType;
  const item: CourseItem = { ...base, id: resourceId, kind };

  switch (kind) {
    case "assignment": {
      const settingsPath = resource.files.find((file) => file.endsWith("assignment_settings.xml"));
      const bodyPath = resource.files.find((file) => file.endsWith(".html"));

      if (settingsPath) {
        item.settingsPath = settingsPath;
        const doc = await reader.xml(settingsPath, warnings);
        if (doc) {
          item.assignment = readAssignmentDetails(doc, groupTitles);
          const own = childText(childElement(doc, "assignment") ?? doc.documentElement, "title");
          if (own) item.ownTitle = own;
        }
      }
      if (bodyPath) {
        item.bodyPath = bodyPath;
        item.bodySource = "html";
      }
      break;
    }

    case "quiz": {
      const folder = resolveAssessmentFolder(resource, resources, entries);
      const assessment = folder ? assessments.get(folder) : undefined;

      if (!assessment) {
        warnings.push(`The quiz "${moduleItem.title}" has no assessment settings in the export.`);
        item.quiz = emptyQuizDetails();
        break;
      }

      const details = buildQuizDetails(assessment, groupTitles, banks);
      item.quiz = details;
      if (assessment.settings?.title) item.ownTitle = assessment.settings.title;
      if (assessment.settings) {
        item.settingsPath = details.settingsSource;
        item.bodyPath = details.settingsSource;
        item.bodySource = "quiz-description";
      }
      break;
    }

    case "page": {
      const bodyPath = resource.files.find((file) => file.endsWith(".html"));
      if (bodyPath) {
        item.bodyPath = bodyPath;
        item.bodySource = "html";
        const source = await reader.text(bodyPath);
        if (source) item.page = readPageDetails(source);
      }
      break;
    }

    case "discussion": {
      const discussionPath = resource.files.find((file) => file.endsWith(".xml") && !file.includes("/"));
      if (discussionPath) {
        const doc = await reader.xml(discussionPath, warnings);
        if (doc) {
          item.bodyPath = discussionPath;
          item.bodySource = "discussion";
          item.discussion = readDiscussionDetails(doc);
        }
      }

      // A discussion's settings live in a separate sidecar, named by the
      // resource's dependency.
      for (const dependencyId of resource.dependencies) {
        const dependency = resources.get(dependencyId);
        const sidecarPath = dependency?.files.find((file) => file.endsWith(".xml"));
        if (!sidecarPath) continue;

        const doc = await reader.xml(sidecarPath, warnings);
        if (!doc) continue;

        item.discussion = { ...(item.discussion ?? emptyDiscussion()), ...readDiscussionDetails(doc) };
        break;
      }

      // A graded discussion's points live in an assignment block.
      const assignmentPath = resource.files.find((file) => file.endsWith("assignment_settings.xml"));
      if (assignmentPath) {
        const doc = await reader.xml(assignmentPath, warnings);
        if (doc) {
          item.settingsPath = assignmentPath;
          const assignment = readAssignmentDetails(doc, groupTitles);
          item.discussion = {
            ...(item.discussion ?? emptyDiscussion()),
            graded: true,
            pointsPossible: assignment.pointsPossible,
            groupId: assignment.groupId,
            groupTitle: assignment.groupTitle,
            rubricId: assignment.rubricId,
            rubricUseForGrading: assignment.rubricUseForGrading,
            dueAt: assignment.dueAt,
          };
        }
      }
      break;
    }

    case "external-url": {
      const linkPath = resource.files.find((file) => file.endsWith(".xml"));
      if (linkPath) {
        const doc = await reader.xml(linkPath, warnings);
        if (doc) {
          const link = descendantElements(doc, "webLink")[0];
          const url = link ? childText(link, "url") : "";
          if (url) item.url = url;
        }
      }
      break;
    }

    case "external-tool": {
      const toolPath = resource.files.find((file) => file.endsWith(".xml"));
      if (toolPath) {
        const doc = await reader.xml(toolPath, warnings);
        if (doc) {
          const link = descendantElements(doc, "cartridge_basiclti_link")[0];
          const url = link ? childText(link, "url") : "";
          if (url) item.url = url;
        }
      }
      break;
    }

    case "file": {
      const filePath = resource.files.find((file) => file.startsWith("web_resources/"));
      if (filePath) item.bodyPath = filePath;
      break;
    }
  }

  return item;
}

/**
 * Find the assessment folder a quiz resource belongs to.
 *
 * Canvas writes two resources for one classic quiz: the question stub, and
 * the settings and the real questions. The second is reached through a
 * dependency, so the folder is looked for there too.
 */
function resolveAssessmentFolder(
  resource: Resource,
  resources: Map<string, Resource>,
  entries: Map<string, AssessmentEntry>,
): string | undefined {
  for (const file of resource.files) {
    const folder = folderOfPath(file);
    if (folder && entries.has(folder)) return folder;
  }

  for (const dependencyId of resource.dependencies) {
    const dependency = resources.get(dependencyId);
    if (!dependency) continue;
    for (const file of dependency.files) {
      const folder = folderOfPath(file);
      if (folder && entries.has(folder)) return folder;
    }
  }

  if (entries.has(resource.id)) return resource.id;

  return undefined;
}

/** Work out a content kind from a resource, when the module did not say. */
function kindFromResource(resource: Resource): ContentType {
  if (resource.type === "imswl_xmlv1p1") return "external-url";
  if (resource.type === "imsdt_xmlv1p1") return "discussion";
  if (resource.type === "imsbasiclti_xmlv1p0") return "external-tool";
  if (resource.type.startsWith("imsqti")) return "quiz";
  if (resource.href.startsWith("wiki_content/")) return "page";
  if (resource.href.startsWith("web_resources/")) return "file";
  if (resource.files.some((file) => file.endsWith("assignment_settings.xml"))) return "assignment";
  if (resource.files.some((file) => file.endsWith("assessment_qti.xml"))) return "quiz";
  return "unknown";
}

/** Read the settings of an assignment. */
function readAssignmentDetails(doc: Document, groupTitles: Map<string, string>): AssignmentDetails {
  const assignment = childElement(doc, "assignment") ?? doc.documentElement;

  const groupId = childText(assignment, "assignment_group_identifierref");

  return {
    pointsPossible: childNumber(assignment, "points_possible"),
    gradingType: childText(assignment, "grading_type") || undefined,
    submissionTypes: childTexts(assignment, "submission_types"),
    dueAt: childText(assignment, "due_at") || undefined,
    unlockAt: childText(assignment, "unlock_at") || undefined,
    lockAt: childText(assignment, "lock_at") || undefined,
    groupId: groupId || undefined,
    groupTitle: groupId ? groupTitles.get(groupId) : undefined,
    workflowState: childText(assignment, "workflow_state") || undefined,
    peerReviews: childText(assignment, "peer_reviews") === "true",
    peerReviewCount: childNumber(assignment, "peer_review_count") ?? 0,
    omitFromFinalGrade: childText(assignment, "omit_from_final_grade") === "true",
    hideInGradebook: childText(assignment, "hide_in_gradebook") === "true",
    groupCategory: childText(assignment, "has_group_category") === "true",
    allowedExtensions: childTexts(assignment, "allowed_extensions"),
    allowedAttempts: childNumber(assignment, "allowed_attempts"),
    rubricId: childText(assignment, "rubric_identifierref") || undefined,
    rubricUseForGrading: childText(assignment, "rubric_use_for_grading") === "true",
    rubricHidePoints: childText(assignment, "rubric_hide_points") === "true",
    rubricHideScoreTotal: childText(assignment, "rubric_hide_score_total") === "true",
    rubricHideOutcomeResults: childText(assignment, "rubric_hide_outcome_results") === "true",
  };
}

/** The settings of a quiz the export does not describe. */
function emptyQuizDetails(): QuizDetails {
  return {
    shuffleQuestions: false,
    shuffleAnswers: false,
    available: false,
    lockdownBrowser: false,
    showCorrectAnswers: false,
    questionCount: 0,
    questionTypes: {},
    inlinePoints: 0,
    textBlockCount: 0,
    selectionPoints: 0,
    selectionCountUnknown: false,
    engine: "new",
    contentSource: "none",
    selections: [],
    oneQuestionAtATime: false,
    hideResults: false,
    rubricUseForGrading: false,
    readability: "stub",
  };
}

/** Build the quiz details from the assessment and its settings. */
function buildQuizDetails(
  assessment: AssessmentData,
  groupTitles: Map<string, string>,
  banks: Map<string, ItemBank>,
): QuizDetails {
  const settings = assessment.settings;

  // Resolve each selection against the banks the export carries.
  const selections: QuizSelection[] = assessment.selections.map((selection) => {
    const bank = selection.bankId ? banks.get(selection.bankId) : undefined;
    if (!bank) return { ...selection };

    // A selection with no number takes every item in the bank. The bank file
    // says how many items there are, so the count can be worked out.
    if (selection.count === undefined) {
      return {
        ...selection,
        bankTitle: bank.title,
        bankFilePresent: true,
        count: bank.itemCount,
        drawsAll: true,
      };
    }

    return {
      ...selection,
      bankTitle: bank.title,
      bankFilePresent: true,
    };
  });

  const bankSelections = selections.filter((selection) => selection.bankId);
  const ownSelections = selections.filter((selection) => !selection.bankId);

  const drawnCount = bankSelections.reduce((total, selection) => total + (selection.count ?? 0), 0);
  const bankPoints = bankSelections.reduce(
    (total, selection) => total + (selection.count ?? 0) * (selection.pointsPerItem ?? 0),
    0,
  );

  // A selection of the quiz's own questions says what each of them is worth,
  // which the questions' own metadata does not always agree with.
  const ownPoints =
    ownSelections.length > 0
      ? ownSelections.reduce((total, selection) => total + (selection.count ?? 0) * (selection.pointsPerItem ?? 0), 0)
      : assessment.inlinePoints;

  const selectionCountUnknown = selections.some((selection) => selection.count === undefined);

  // The total can only be worked out when every selection says how many
  // questions it takes.
  const pointsTotal = selectionCountUnknown ? undefined : ownPoints + bankPoints;

  const contentSource: QuizDetails["contentSource"] =
    assessment.questionCount > 0 && bankSelections.length > 0
      ? "both"
      : assessment.questionCount > 0
        ? "items"
        : bankSelections.length > 0
          ? "banks"
          : "none";

  const engine: QuizEngine = !settings
    ? "unknown"
    : settings.quizType === "survey" || settings.quizType === "graded_survey"
      ? "survey"
      : "classic";

  return {
    pointsPossible: settings?.pointsPossible,
    quizType: settings?.quizType,
    allowedAttempts: settings?.allowedAttempts,
    shuffleQuestions: settings?.shuffleQuestions ?? false,
    shuffleAnswers: settings?.shuffleAnswers ?? false,
    timeLimit: settings?.timeLimit,
    dueAt: settings?.dueAt,
    unlockAt: settings?.unlockAt,
    lockAt: settings?.lockAt,
    available: settings?.available ?? false,
    lockdownBrowser: settings?.lockdownBrowser ?? false,
    accessCode: settings?.accessCode,
    showCorrectAnswers: settings?.showCorrectAnswers ?? false,
    scoringPolicy: settings?.scoringPolicy,
    questionCount: assessment.questionCount,
    questionTypes: assessment.questionTypes,
    inlinePoints: assessment.inlinePoints,
    textBlockCount: assessment.textBlockCount,
    drawnCount: drawnCount > 0 ? drawnCount : undefined,
    bankPoints: bankPoints > 0 ? bankPoints : undefined,
    selectionPoints: ownPoints + bankPoints,
    pointsTotal,
    selectionCountUnknown,
    engine,
    contentSource,
    selections,
    oneQuestionAtATime: settings?.oneQuestionAtATime ?? false,
    hideResults: settings?.hideResults ?? false,
    groupId: settings?.groupId,
    groupTitle: settings?.groupId ? groupTitles.get(settings.groupId) : undefined,
    rubricId: settings?.rubricId,
    rubricUseForGrading: settings?.rubricUseForGrading ?? false,
    settingsSource: settings ? assessment.settingsPath : undefined,
    questionsSource: assessment.qtiPath,
    readability: settings ? (assessment.qtiPath ? "complete" : "partial") : "stub",
  };
}

/** Read the settings of a discussion. */
function readDiscussionDetails(doc: Document): DiscussionDetails {
  const topic = allElements(doc, "topicMeta")[0];

  if (!topic) {
    return emptyDiscussion();
  }

  return {
    discussionType: childText(topic, "discussion_type") || undefined,
    requireInitialPost: childText(topic, "require_initial_post") === "true",
    allowRating: childText(topic, "allow_rating") === "true",
    anonymousState: childText(topic, "anonymous_state") || undefined,
    graded: false,
    workflowState: childText(topic, "workflow_state") || undefined,
    rubricUseForGrading: false,
  };
}

/** The settings of a discussion that has no settings file. */
function emptyDiscussion(): DiscussionDetails {
  return { requireInitialPost: false, allowRating: false, graded: false, rubricUseForGrading: false };
}

/** Read the settings of a wiki page, from the `<meta>` tags in its HTML. */
function readPageDetails(source: string): PageDetails {
  const doc = new DOMParser().parseFromString(source, "text/html");

  const meta = (name: string): string => {
    const element = doc.querySelector(`meta[name="${name}"]`);
    return (element?.getAttribute("content") ?? "").trim();
  };

  return {
    frontPage: meta("front_page") === "true",
    editingRoles: meta("editing_roles") || undefined,
    workflowState: meta("workflow_state") || undefined,
  };
}

/**
 * Find the content that is in the export but not placed in any module.
 *
 * Orphaned pages and quizzes are easy to miss in Canvas and are exactly the
 * kind of thing a QA pass wants to know about.
 */
async function buildOrphans(
  reader: Reader,
  resources: Map<string, Resource>,
  used: Set<string>,
  assessments: Map<string, AssessmentData>,
  banks: Map<string, ItemBank>,
  groupTitles: Map<string, string>,
): Promise<CourseItem[]> {
  const orphans: CourseItem[] = [];

  for (const resource of resources.values()) {
    if (used.has(resource.id)) continue;
    if (resource.href.startsWith("course_settings/")) continue;
    if (resource.href.startsWith("web_resources/")) continue;
    if (resource.href.startsWith("lti_resource_links/")) continue;

    // A resource that only holds a quiz's settings is covered by the quiz.
    if (resource.files.some((file) => file.endsWith("/assessment_meta.xml"))) continue;

    const folder = folderOfResource(resource);
    const assessment = folder ? assessments.get(folder) : undefined;

    // A question bank is not an orphan; it is a pool of questions.
    if (assessment?.isBank) continue;

    if (assessment) {
      const item: CourseItem = {
        id: resource.id,
        kind: "quiz",
        title: assessment.title ?? "Assessment (not in any module)",
        state: "unpublished",
        unresolved: true,
        unresolvedReason: "This assessment is in the export, but no module points at it.",
      };

      const details = buildQuizDetails(assessment, groupTitles, banks);
      item.quiz = details;
      if (assessment.settings) {
        item.settingsPath = details.settingsSource;
        item.bodyPath = details.settingsSource;
        item.bodySource = "quiz-description";
      }

      orphans.push(item);
      continue;
    }

    const kind = kindFromResource(resource);
    if (kind === "unknown" || kind === "file") continue;

    const item: CourseItem = {
      id: resource.id,
      kind,
      title: (await readOrphanTitle(reader, resource)) ?? genericOrphanTitle(kind),
      state: "unpublished",
      unresolved: true,
      unresolvedReason: "This content is in the export, but no module points at it.",
    };

    const bodyPath = resource.files.find((file) => file.endsWith(".html"));
    if (bodyPath) {
      item.bodyPath = bodyPath;
      item.bodySource = "html";
      const source = await reader.text(bodyPath);
      if (source) {
        const title = htmlTitle(source);
        if (title) item.title = title;
        if (kind === "page") item.page = readPageDetails(source);
      }
    }

    orphans.push(item);
  }

  return orphans;
}

/**
 * The title of content that no module refers to.
 *
 * Some resources have no `href` in the manifest, so their title has to come
 * from the file itself.
 */
async function readOrphanTitle(reader: Reader, resource: Resource): Promise<string | undefined> {
  const xmlPath = resource.files.find((file) => file.endsWith(".xml") || file.endsWith(".qti"));
  if (!xmlPath) return undefined;

  const source = await reader.text(xmlPath);
  if (!source) return undefined;

  try {
    const doc = parseXml(source, xmlPath);

    const assessment = allElements(doc, "assessment")[0];
    if (assessment) {
      const title = assessment.getAttribute("title")?.trim();
      if (title) return title;
    }

    const quiz = allElements(doc, "quiz")[0];
    if (quiz) {
      const title = childText(quiz, "title");
      if (title) return title;
    }

    const tool = allElements(doc, "cartridge_basiclti_link")[0];
    if (tool) {
      const title = descendantElements(tool, "title")[0]?.textContent?.trim();
      if (title) return title;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/** A readable title for content whose own file has none. */
function genericOrphanTitle(kind: ContentType): string {
  switch (kind) {
    case "quiz":
      return "Quiz (not in any module)";
    case "external-tool":
      return "External tool (not in any module)";
    case "external-url":
      return "External link (not in any module)";
    case "page":
      return "Page (not in any module)";
    case "discussion":
      return "Discussion (not in any module)";
    default:
      return "Assignment (not in any module)";
  }
}

/** The `<title>` of an HTML document. */
function htmlTitle(source: string): string {
  const doc = new DOMParser().parseFromString(source, "text/html");
  return (doc.title ?? "").trim();
}

// ---------------------------------------------------------------------------
// Item banks
// ---------------------------------------------------------------------------

/** List the question banks the export carries, and who draws from them. */
function indexBanks(assessments: Map<string, AssessmentData>): Map<string, ItemBank> {
  const banks = new Map<string, ItemBank>();

  for (const assessment of assessments.values()) {
    if (!assessment.isBank || !assessment.qtiPath) continue;

    banks.set(assessment.folder, {
      id: assessment.folder,
      title: assessment.title ?? "Untitled question bank",
      itemCount: assessment.bankItemCount,
      path: assessment.qtiPath,
      usedBy: [],
    });
  }

  return banks;
}

/** List the question banks the export carries, and who draws from them. */
function buildItemBanks(banks: Map<string, ItemBank>, items: CourseItem[]): ItemBank[] {
  for (const item of items) {
    for (const selection of item.quiz?.selections ?? []) {
      if (!selection.bankId) continue;
      const bank = banks.get(selection.bankId);
      if (!bank) continue;
      if (!bank.usedBy.includes(item.id)) bank.usedBy.push(item.id);
    }
  }

  return [...banks.values()].sort((a, b) => a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** List the files carried in the cartridge's `web_resources` folder. */
function readFiles(store: FileStore, resources: Map<string, Resource>, filesMeta: string | undefined): CourseFile[] {
  const hidden = readHiddenFiles(resources, filesMeta);
  const pathToId = new Map<string, string>();
  for (const resource of resources.values()) {
    for (const file of resource.files) pathToId.set(file, resource.id);
  }

  const files: CourseFile[] = [];

  for (const path of store.paths()) {
    if (!path.startsWith("web_resources/")) continue;

    const rest = path.slice("web_resources/".length);
    const slash = rest.lastIndexOf("/");
    const displayName = slash === -1 ? rest : rest.slice(slash + 1);
    const folder = slash === -1 ? undefined : rest.slice(0, slash);
    const extension = displayName.includes(".") ? displayName.split(".").pop()!.toLowerCase() : "";

    files.push({
      id: pathToId.get(path) ?? path,
      path,
      displayName,
      folder,
      hidden: hidden.has(path),
      mimeType: MIME_TYPES[extension],
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** The paths of the files Canvas marks as hidden. */
function readHiddenFiles(resources: Map<string, Resource>, filesMeta: string | undefined): Set<string> {
  const hidden = new Set<string>();
  if (!filesMeta) return hidden;

  let doc: Document;
  try {
    doc = parseXml(filesMeta, "files_meta.xml");
  } catch {
    return hidden;
  }

  const hiddenFolders = childElements(doc, "folders")
    .flatMap((folders) => childElements(folders, "folder"))
    .filter((folder) => childText(folder, "hidden") === "true")
    .map((folder) => childText(folder, "path"));

  for (const file of descendantElements(doc, "file")) {
    if (childText(file, "hidden") !== "true") continue;
    const resource = resources.get(file.getAttribute("identifier") ?? "");
    for (const path of resource?.files ?? []) hidden.add(path);
  }

  for (const folder of hiddenFolders) {
    for (const resource of resources.values()) {
      for (const path of resource.files) {
        if (path.startsWith(`web_resources/${folder}/`)) hidden.add(path);
      }
    }
  }

  return hidden;
}

// ---------------------------------------------------------------------------
// Content index
// ---------------------------------------------------------------------------

/** Process the body of every item so the viewer can search and audit them. */
async function buildContentIndex(
  store: FileStore,
  course: CourseExport,
  domain: string,
): Promise<Map<string, ProcessedContent>> {
  const all = [...course.items, ...course.orphans];

  const paths = all
    .filter((item) => item.kind !== "file")
    .map((item) => item.bodyPath)
    .filter((path): path is string => Boolean(path));

  const sources = await Promise.all(paths.map((path) => store.text(path)));
  const byPath = new Map<string, string>();
  paths.forEach((path, index) => {
    const source = sources[index];
    if (source !== undefined) byPath.set(path, source);
  });

  const content = new Map<string, ProcessedContent>();

  for (const item of all) {
    if (!item.bodyPath || item.kind === "file") continue;
    const source = byPath.get(item.bodyPath);
    if (source === undefined) continue;

    const html = bodyHtml(item, source);
    content.set(item.id, processContent(html, domain));
  }

  return content;
}

/** The body HTML of an item, read the way its file stores it. */
function bodyHtml(item: CourseItem, source: string): string {
  switch (item.bodySource) {
    case "discussion":
      return extractElementHtml(source, "text", "discussion.xml");
    case "quiz-description":
      return extractElementHtml(source, "description", "quiz settings");
    default:
      return source;
  }
}

/**
 * Pull an HTML body out of an XML file.
 *
 * The HTML is escaped inside the XML, so it has to be read from the element's
 * text rather than taken from the markup.
 */
function extractElementHtml(source: string, elementName: string, label: string): string {
  try {
    const doc = parseXml(source, label);
    const element = allElements(doc, elementName)[0];
    return textOf(element);
  } catch {
    return "";
  }
}
