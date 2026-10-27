import type { CanvasCourseModel, CourseEntity } from "../model";
import { describeQuestionCount, describeQuestionSource, summariseQuestions } from "../quiz";

export interface DetailRow {
  label: string;
  value: string;
}

function rubricTitle(model: CanvasCourseModel, rubricId?: string): string | undefined {
  if (!rubricId) return undefined;
  return (
    model.export.rubrics.find((rubric) => rubric.id === rubricId)?.title ?? "Referenced rubric is not in this export"
  );
}

/** Factual metadata shown in Course Explorer and reusable by focused tools. */
export function getEntityDetailRows(model: CanvasCourseModel, entity: CourseEntity): DetailRow[] {
  const { item } = entity;
  const rows: DetailRow[] = [];
  const add = (label: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") rows.push({ label, value: String(value) });
  };
  const addDate = (label: string, value: string | undefined) => {
    if (value) add(label, formatCanvasTimestamp(value));
  };

  if (entity.ownTitle && entity.ownTitle !== entity.title) add("Content title", entity.ownTitle);

  if (item.assignment) {
    const value = item.assignment;
    add("Points", value.pointsPossible);
    add("Grading", value.gradingType?.replace(/_/g, " "));
    add("Submission", value.submissionTypes.join(", ").replace(/_/g, " "));
    add("Assignment group", value.groupTitle);
    addDate("Due", value.dueAt);
    addDate("Available from", value.unlockAt);
    addDate("Available until", value.lockAt);
    add("Rubric", rubricTitle(model, value.rubricId));
    if (value.rubricId) add("Rubric role", value.rubricUseForGrading ? "Used for grading" : "Attached for reference");
    if (value.peerReviews) add("Peer reviews", value.peerReviewCount);
    if (value.allowedAttempts !== undefined)
      add("Attempts", value.allowedAttempts < 0 ? "Unlimited" : value.allowedAttempts);
    if (value.allowedExtensions.length > 0) add("Allowed file types", value.allowedExtensions.join(", "));
    if (value.omitFromFinalGrade) add("Final grade", "Excluded");
  }

  if (item.quiz) {
    const quiz = item.quiz;
    add("Points", quiz.pointsPossible);
    add("Questions", describeQuestionCount(summariseQuestions(quiz)));
    add("Question source", describeQuestionSource(quiz));
    add("Quiz type", quiz.quizType?.replace(/_/g, " "));
    add(
      "Attempts",
      quiz.allowedAttempts === undefined ? undefined : quiz.allowedAttempts < 0 ? "Unlimited" : quiz.allowedAttempts,
    );
    if (quiz.timeLimit !== undefined) add("Time limit", `${quiz.timeLimit} minutes`);
    add("Assignment group", quiz.groupTitle);
    addDate("Due", quiz.dueAt);
    add("Rubric", rubricTitle(model, quiz.rubricId));
    if (quiz.rubricId) add("Rubric role", quiz.rubricUseForGrading ? "Used for grading" : "Attached for reference");
    add("Question order", quiz.shuffleQuestions ? "Shuffled" : "As listed");
    add("Answer order", quiz.shuffleAnswers ? "Shuffled" : "As listed");
    if (quiz.lockdownBrowser) add("Lockdown browser", "Required");
    if (quiz.accessCode) add("Access code", "Required");
  }

  if (item.discussion) {
    const discussion = item.discussion;
    add("Graded", discussion.graded ? "Yes" : "No");
    add("Points", discussion.pointsPossible);
    add("Discussion type", discussion.discussionType?.replace(/_/g, " "));
    add("Initial post", discussion.requireInitialPost ? "Required before replying" : "Not required before replying");
    add("Assignment group", discussion.groupTitle);
    addDate("Due", discussion.dueAt);
    add("Rubric", rubricTitle(model, discussion.rubricId));
    if (discussion.rubricId)
      add("Rubric role", discussion.rubricUseForGrading ? "Used for grading" : "Attached for reference");
    if (discussion.allowRating) add("Rating", "Allowed");
    add("Anonymity", discussion.anonymousState?.replace(/_/g, " "));
  }

  if (item.page) {
    if (item.page.frontPage) add("Front page", "Yes");
    add("Who can edit", item.page.editingRoles);
  }

  if (entity.kind === "file") {
    const file = model.export.files.find((candidate) => candidate.path === item.bodyPath);
    add("File name", file?.displayName);
    add("Folder", file?.folder);
    add("File type", file?.mimeType);
    if (file?.size !== undefined) add("File size", formatFileSize(file.size));
  }

  return rows;
}

/** Format the recorded timestamp without shifting its calendar day by timezone. */
function formatCanvasTimestamp(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value;

  const [, year, month, day, hour, minute] = match;
  const monthName = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
  );
  let result = `${monthName} ${Number(day)}, ${year}`;

  if (hour !== undefined && minute !== undefined) {
    const hourNumber = Number(hour);
    const suffix = hourNumber >= 12 ? "PM" : "AM";
    const displayHour = hourNumber % 12 || 12;
    result += ` at ${displayHour}:${minute} ${suffix}`;
  }
  if (value.endsWith("Z")) result += " UTC";
  return result;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
