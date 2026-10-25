/**
 * Reading a Canvas course export into a course the viewer can browse.
 *
 * A Canvas export is an IMS Common Cartridge. The pieces that matter are:
 *
 * - `imsmanifest.xml` — the resource list and the module organization.
 * - `course_settings/module_meta.xml` — the modules and their items.
 * - `course_settings/course_settings.xml` — the course settings.
 * - one folder per assignment, quiz, or discussion.
 * - `wiki_content/` — the pages.
 *
 * The join between a module item and the content it points at runs through
 * the manifest: a module item's identifier matches an `<item>` in the
 * manifest's organization, whose `identifierref` names a `<resource>`. The
 * module's own `identifierref` cannot be trusted — for external links Canvas
 * writes the item's identifier there instead of the resource identifier.
 */
import { processContent, type ProcessedContent } from "./content";
import type { FileStore } from "./store";
import {
  allElements,
  childElement,
  childElements,
  childNumber,
  childText,
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
  LatePolicy,
  Module,
  ModuleItem,
  PageDetails,
  PublishState,
  QuizDetails,
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
  /** Name of the file or folder the course was read from. */
  sourceName: string;
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
  const warnings: string[] = [];

  const manifestText = await store.text("imsmanifest.xml");
  if (manifestText === undefined) {
    throw new Error("This export has no imsmanifest.xml, so it is not a Canvas course export.");
  }

  const manifest = parseXml(manifestText, "imsmanifest.xml");
  const resources = readResources(manifest);
  const organizationItems = readOrganizationItems(manifest);

  const settingsFiles = await readSettingsFiles(store, warnings);
  const meta = readMeta(manifest, settingsFiles, options.sourceName, resources, warnings);
  const settings = readCourseSettings(settingsFiles.courseSettings, warnings);
  const assignmentGroups = readAssignmentGroups(settingsFiles.assignmentGroups, warnings);
  const latePolicy = readLatePolicy(settingsFiles.latePolicy, warnings);

  const modules = readModules(settingsFiles.moduleMeta, warnings);
  const { items, orphans } = await buildContent(store, modules, resources, organizationItems, settingsFiles, warnings);

  const courseExport: CourseExport = {
    meta,
    modules,
    items,
    orphans,
    files: readFiles(store, resources, settingsFiles.filesMeta),
    assignmentGroups,
    settings,
    latePolicy,
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
}

/** Read the `course_settings` files. */
async function readSettingsFiles(store: FileStore, warnings: string[]): Promise<SettingsFiles> {
  const names = [
    ["courseSettings", "course_settings/course_settings.xml"],
    ["moduleMeta", "course_settings/module_meta.xml"],
    ["assignmentGroups", "course_settings/assignment_groups.xml"],
    ["filesMeta", "course_settings/files_meta.xml"],
    ["latePolicy", "course_settings/late_policy.xml"],
    ["context", "course_settings/context.xml"],
  ] as const;

  const entries = await Promise.all(names.map(async ([key, path]) => [key, await store.text(path)] as const));
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
  store: FileStore,
  modules: Module[],
  resources: Map<string, Resource>,
  organizationItems: Map<string, OrganizationItem>,
  files: SettingsFiles,
  warnings: string[],
): Promise<{ items: CourseItem[]; orphans: CourseItem[] }> {
  const items: CourseItem[] = [];
  const used = new Set<string>();

  for (const module of modules) {
    for (const moduleItem of module.items) {
      const resourceId = resolveResourceId(moduleItem, organizationItems, resources);
      const item = await buildItem(store, moduleItem, module, resourceId, resources, files, warnings);
      items.push(item);
      if (resourceId) used.add(resourceId);
    }
  }

  const orphans = await buildOrphans(store, resources, used, warnings);
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
  store: FileStore,
  moduleItem: ModuleItem,
  module: Module,
  resourceId: string | undefined,
  resources: Map<string, Resource>,
  files: SettingsFiles,
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
        const source = await store.text(settingsPath);
        if (source) {
          item.assignment = readAssignmentDetails(source, files.assignmentGroups, warnings);
        }
      }
      if (bodyPath) item.bodyPath = bodyPath;
      break;
    }

    case "quiz": {
      const folder = resource.files.find((file) => file.includes("/") && file.endsWith("assessment_qti.xml"));
      const folderId = folder ? folder.slice(0, folder.indexOf("/")) : resourceId;

      const quiz = await readQuiz(store, resourceId, folderId, warnings);
      if (quiz) {
        item.settingsPath = quiz.settingsPath;
        item.quiz = quiz.details;
      } else {
        warnings.push(`The quiz "${moduleItem.title}" has no assessment_meta.xml.`);
      }
      break;
    }

    case "page": {
      const bodyPath = resource.files.find((file) => file.endsWith(".html"));
      if (bodyPath) {
        item.bodyPath = bodyPath;
        const source = await store.text(bodyPath);
        if (source) item.page = readPageDetails(source);
      }
      break;
    }

    case "discussion": {
      const discussionPath = resource.files.find((file) => file.endsWith(".xml"));
      if (discussionPath) {
        const source = await store.text(discussionPath);
        if (source) {
          item.bodyPath = discussionPath;
          item.discussion = readDiscussionDetails(source, discussionPath, warnings);
        }
      }

      // A discussion's settings live in a separate sidecar, named by the
      // resource's dependency.
      for (const dependencyId of resource.dependencies) {
        const dependency = resources.get(dependencyId);
        const sidecarPath = dependency?.files.find((file) => file.endsWith(".xml"));
        if (!sidecarPath) continue;

        const sidecar = await store.text(sidecarPath);
        if (!sidecar) continue;

        const details = readDiscussionDetails(sidecar, sidecarPath, warnings);
        item.discussion = { ...(item.discussion ?? emptyDiscussion()), ...details };
        break;
      }
      break;
    }

    case "external-url": {
      const linkPath = resource.files.find((file) => file.endsWith(".xml"));
      if (linkPath) {
        const source = await store.text(linkPath);
        if (source) {
          const doc = parseXml(source, linkPath);
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
        const source = await store.text(toolPath);
        if (source) {
          const doc = parseXml(source, toolPath);
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
function readAssignmentDetails(
  source: string,
  groupsSource: string | undefined,
  warnings: string[],
): AssignmentDetails {
  const doc = parseSettingsXml(source, "assignment_settings.xml", warnings);
  const assignment = childElement(doc, "assignment") ?? doc.documentElement;

  const groupId = childText(assignment, "assignment_group_identifierref");

  return {
    pointsPossible: childNumber(assignment, "points_possible"),
    gradingType: childText(assignment, "grading_type") || undefined,
    submissionTypes: childTextsOf(assignment, "submission_types"),
    dueAt: childText(assignment, "due_at") || undefined,
    unlockAt: childText(assignment, "unlock_at") || undefined,
    lockAt: childText(assignment, "lock_at") || undefined,
    groupId: groupId || undefined,
    groupTitle: groupId ? findGroupTitle(groupsSource, groupId) : undefined,
    workflowState: childText(assignment, "workflow_state") || undefined,
    peerReviews: childText(assignment, "peer_reviews") === "true",
    peerReviewCount: childNumber(assignment, "peer_review_count") ?? 0,
    omitFromFinalGrade: childText(assignment, "omit_from_final_grade") === "true",
    hideInGradebook: childText(assignment, "hide_in_gradebook") === "true",
    groupCategory: childText(assignment, "has_group_category") === "true",
    allowedExtensions: childTextsOf(assignment, "allowed_extensions"),
  };
}

/** Read a quiz's settings and its questions. */
async function readQuiz(
  store: FileStore,
  quizId: string,
  folderId: string,
  warnings: string[],
): Promise<{ details: QuizDetails; settingsPath: string } | undefined> {
  const metaPath = `${folderId}/assessment_meta.xml`;
  const metaSource = await store.text(metaPath);
  if (!metaSource) return undefined;

  const details = readQuizDetails(metaSource, warnings);

  // The questions live in `non_cc_assessments`, or beside the metadata.
  const nonCcPath = `non_cc_assessments/${quizId}.xml.qti`;
  const nonCcSource = await store.text(nonCcPath);
  const qtiPath = nonCcSource !== undefined ? nonCcPath : `${folderId}/assessment_qti.xml`;
  const qtiSource = nonCcSource ?? (await store.text(qtiPath));

  if (qtiSource) {
    const questions = readQuestions(qtiSource);
    details.questionCount = questions.count;
    details.questionTypes = questions.types;
  }

  return { details, settingsPath: metaPath };
}

/** Read the settings of a quiz. */
function readQuizDetails(source: string, warnings: string[]): QuizDetails {
  const doc = parseSettingsXml(source, "assessment_meta.xml", warnings);
  const quiz = childElement(doc, "quiz") ?? doc.documentElement;
  const assignment = childElement(quiz, "assignment");

  return {
    pointsPossible: childNumber(quiz, "points_possible") ?? childNumber(assignment ?? quiz, "points_possible"),
    quizType: childText(quiz, "quiz_type") || undefined,
    allowedAttempts: childNumber(quiz, "allowed_attempts"),
    shuffleQuestions: childText(quiz, "shuffle_questions") === "true",
    shuffleAnswers: childText(quiz, "shuffle_answers") === "true",
    timeLimit: childNumber(quiz, "time_limit"),
    dueAt: childText(quiz, "due_at") || undefined,
    available: childText(quiz, "available") === "true",
    lockdownBrowser: childText(quiz, "require_lockdown_browser") === "true",
    accessCode: childText(quiz, "access_code") || undefined,
    showCorrectAnswers: childText(quiz, "show_correct_answers") === "true",
    scoringPolicy: childText(quiz, "scoring_policy") || undefined,
    questionCount: 0,
    questionTypes: {},
  };
}

/** Read the settings of a discussion. */
function readDiscussionDetails(source: string, label: string, warnings: string[]): DiscussionDetails {
  const doc = parseSettingsXml(source, label, warnings);
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
  };
}

/** The settings of a discussion that has no settings file. */
function emptyDiscussion(): DiscussionDetails {
  return { requireInitialPost: false, allowRating: false, graded: false };
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

/** Count the questions in a QTI file, and how many of each type. */
function readQuestions(source: string): { count: number; types: Record<string, number> } {
  const types: Record<string, number> = {};

  let doc: Document;
  try {
    doc = parseXml(source, "assessment_qti.xml");
  } catch {
    return { count: 0, types };
  }

  const items = descendantElements(doc, "item");
  for (const item of items) {
    const type = readQuestionType(item);
    if (type) types[type] = (types[type] ?? 0) + 1;
  }

  return { count: items.length, types };
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

/** The trimmed text of every child element with the given name. */
function childTextsOf(parent: Element, localName: string): string[] {
  return childElements(parent, localName)
    .map((element) => (element.textContent ?? "").trim())
    .filter((text) => text !== "");
}

/** The title of an assignment group, looked up by identifier. */
function findGroupTitle(groupsSource: string | undefined, groupId: string): string | undefined {
  if (!groupsSource) return undefined;

  try {
    const groups = parseXml(groupsSource, "assignment_groups.xml");
    const group = childElements(groups, "assignmentGroup").find(
      (element) => element.getAttribute("identifier") === groupId,
    );
    return group ? childText(group, "title") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Find the content that is in the export but not placed in any module.
 *
 * Orphaned pages and quizzes are easy to miss in Canvas and are exactly the
 * kind of thing a QA pass wants to know about.
 */
async function buildOrphans(
  store: FileStore,
  resources: Map<string, Resource>,
  used: Set<string>,
  warnings: string[],
): Promise<CourseItem[]> {
  const orphans: CourseItem[] = [];

  for (const resource of resources.values()) {
    if (used.has(resource.id)) continue;
    if (resource.href.startsWith("course_settings/")) continue;
    if (resource.href.startsWith("web_resources/")) continue;

    // The questions of a quiz are listed separately from the quiz itself.
    if (resource.href.startsWith("non_cc_assessments/")) {
      const quizId = resource.href.slice("non_cc_assessments/".length).replace(/\.xml\.qti$/, "");
      if (used.has(quizId)) continue;

      orphans.push({
        id: resource.id,
        kind: "quiz",
        title: (await readOrphanTitle(store, resource)) ?? "Assessment (not in any module)",
        state: "unpublished",
        unresolved: true,
        unresolvedReason: "This assessment is in the export, but no module points at it.",
      });
      continue;
    }

    const kind = kindFromResource(resource);
    if (kind === "unknown" || kind === "file") continue;

    const item: CourseItem = {
      id: resource.id,
      kind,
      title: (await readOrphanTitle(store, resource)) ?? genericOrphanTitle(kind),
      state: "unpublished",
      unresolved: true,
      unresolvedReason: "This content is in the export, but no module points at it.",
    };

    const bodyPath = resource.files.find((file) => file.endsWith(".html"));
    if (bodyPath) {
      item.bodyPath = bodyPath;
      const source = await store.text(bodyPath);
      if (source) {
        const title = htmlTitle(source);
        if (title) item.title = title;
      }
    }

    if (kind === "quiz") {
      const folder = resource.files.find((file) => file.includes("/") && file.endsWith("assessment_qti.xml"));
      const folderId = folder ? folder.slice(0, folder.indexOf("/")) : resource.id;

      const quiz = await readQuiz(store, resource.id, folderId, warnings);
      if (quiz) {
        item.quiz = quiz.details;
        item.settingsPath = quiz.settingsPath;
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
async function readOrphanTitle(store: FileStore, resource: Resource): Promise<string | undefined> {
  const xmlPath = resource.files.find((file) => file.endsWith(".xml") || file.endsWith(".qti"));
  if (!xmlPath) return undefined;

  const source = await store.text(xmlPath);
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

    // A question bank names itself in its metadata.
    const bank = allElements(doc, "objectbank")[0];
    if (bank) {
      for (const field of descendantElements(bank, "qtimetadatafield")) {
        if (childText(field, "fieldlabel") === "bank_title") {
          const title = childText(field, "fieldentry");
          if (title) return title;
        }
      }
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

    // A discussion keeps its body inside the XML, escaped.
    const html = item.kind === "discussion" ? extractDiscussionBody(source) : source;
    content.set(item.id, processContent(html, domain));
  }

  return content;
}

/** Pull the HTML body out of a discussion's XML. */
function extractDiscussionBody(source: string): string {
  try {
    const doc = parseXml(source, "discussion.xml");
    const text = allElements(doc, "text")[0];
    return textOf(text);
  } catch {
    return "";
  }
}
