/**
 * Family C: the quizzes.
 *
 * Courses have several kinds of quiz, and the ones of a kind should behave the
 * same way. This module works out which quizzes belong together, compares
 * their settings, and checks the settings against what the instructions tell
 * students.
 *
 * It never decides which setting is right. It reports the value most quizzes
 * share and the ones that differ, and leaves the choice to the reviewer.
 */
import { summariseQuestions } from "@/lib/canvas/quiz";
import type { QuizDetails } from "@/lib/canvas/types";

import { points as formatPoints } from "@/lib/tools/assessment-review/findings";
import type { Finding, ReviewRules } from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";
import { titlePattern } from "@/lib/tools/assessment-review/usage";

/** One setting the review compares between quizzes. */
export interface QuizSetting {
  id: string;
  label: string;
  /** The value of the setting for one quiz. */
  read: (quiz: QuizDetails) => string | undefined;
}

/** The settings the review compares. */
export const QUIZ_SETTINGS: readonly QuizSetting[] = [
  {
    id: "attempts",
    label: "Attempts",
    read: (quiz) =>
      quiz.allowedAttempts === undefined
        ? undefined
        : quiz.allowedAttempts < 0
          ? "Unlimited"
          : String(quiz.allowedAttempts),
  },
  {
    id: "timeLimit",
    label: "Time limit",
    read: (quiz) => (quiz.timeLimit === undefined ? undefined : `${quiz.timeLimit} minutes`),
  },
  {
    id: "shuffleQuestions",
    label: "Shuffle questions",
    read: (quiz) => (quiz.shuffleQuestions ? "Yes" : "No"),
  },
  {
    id: "shuffleAnswers",
    label: "Shuffle answers",
    read: (quiz) => (quiz.shuffleAnswers ? "Yes" : "No"),
  },
  {
    id: "oneQuestionAtATime",
    label: "One question at a time",
    read: (quiz) => (quiz.oneQuestionAtATime ? "Yes" : "No"),
  },
  {
    id: "scoringPolicy",
    label: "Scoring",
    read: (quiz) => quiz.scoringPolicy,
  },
  {
    id: "showCorrectAnswers",
    label: "Show correct answers",
    read: (quiz) => (quiz.showCorrectAnswers ? "Yes" : "No"),
  },
  {
    id: "lockdownBrowser",
    label: "Lockdown browser",
    read: (quiz) => (quiz.lockdownBrowser ? "Required" : "Not required"),
  },
  {
    id: "points",
    label: "Points",
    read: (quiz) => (quiz.pointsPossible === undefined ? undefined : formatPoints(quiz.pointsPossible)),
  },
  {
    id: "available",
    label: "Available to students",
    read: (quiz) => (quiz.available ? "Yes" : "No"),
  },
];

/** A group of quizzes that should behave the same way. */
export interface QuizComparisonGroup {
  id: string;
  /** A readable name for the group. */
  title: string;
  /** The quizzes in it. */
  quizzes: Assessment[];
  /** Why the tool put them together. */
  reason: string;
}

/** A setting that differs inside a group. */
export interface QuizOutlier {
  groupId: string;
  groupTitle: string;
  settingId: string;
  settingLabel: string;
  /** The value most of the group shares. */
  majority: string;
  /** How many quizzes share that value. */
  majorityCount: number;
  /** The quizzes that differ, and what they say. */
  differing: { quizId: string; title: string; value: string }[];
}

/** A statement the instructions make about a setting. */
export interface InstructionStatement {
  /** What the statement is about. */
  topic: "attempts" | "time-limit" | "shuffling" | "points";
  /** The value the statement gives. */
  value: string;
  /** The sentence the statement came from, so the reviewer can check it. */
  sentence: string;
  /** The number, when the statement gives one. */
  number?: number;
  /** Which of the two shuffling settings the statement is about. */
  which?: "questions" | "answers";
}

/** Everything family C works out about the quizzes. */
export interface QuizReview {
  /** The groups the quizzes fall into. */
  groups: QuizComparisonGroup[];
  /** The settings that differ inside a group. */
  outliers: QuizOutlier[];
  /** The statements the instructions make. */
  statements: Map<string, InstructionStatement[]>;
}

/**
 * Suggest which quizzes belong together.
 *
 * The grouping starts from the title — "Week 3 Webinar Quiz" and "Week 4
 * Webinar Quiz" are the same kind of quiz. When a title stands alone, the
 * quiz engine, its points and its assignment group are used instead.
 */
export function suggestGroups(review: AssessmentReview): QuizComparisonGroup[] {
  const quizzes = review.assessments.filter((assessment) => assessment.kind === "quiz");

  const groups = new Map<string, QuizComparisonGroup>();

  for (const quiz of quizzes) {
    const pattern = titlePattern(quiz.title);
    const existing = groups.get(pattern);
    if (existing) {
      existing.quizzes.push(quiz);
      continue;
    }
    groups.set(pattern, {
      id: pattern,
      title: readableTitle(pattern),
      quizzes: [quiz],
      reason: "The titles follow the same pattern",
    });
  }

  // Quizzes whose title stands alone may still belong with others.
  const secondary = new Map<string, Assessment[]>();

  for (const group of groups.values()) {
    if (group.quizzes.length > 1) continue;

    const quiz = group.quizzes[0];
    const key = secondaryKey(quiz);
    if (!key) continue;

    const list = secondary.get(key) ?? [];
    list.push(quiz);
    secondary.set(key, list);
  }

  for (const [key, members] of secondary) {
    if (members.length < 2) continue;

    const group: QuizComparisonGroup = {
      id: key,
      title: `${members[0].quiz?.engine === "survey" ? "Survey" : "Quiz"} · ${members[0].pointsPossible === undefined ? "points not in export" : `${formatPoints(members[0].pointsPossible)} points`}${members[0].groupTitle ? ` · ${members[0].groupTitle}` : ""}`,
      quizzes: members,
      reason: "The same quiz engine, the same points, and the same assignment group",
    };

    groups.delete(titlePattern(members[0].title));
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** The key that groups a quiz with others of the same kind. */
function secondaryKey(quiz: Assessment): string | undefined {
  const engine = quiz.quiz?.engine;
  if (!engine) return undefined;
  return `kind:${engine}:${quiz.pointsPossible ?? "?"}:${quiz.groupTitle ?? "?"}`;
}

/** A readable name for a title pattern. */
function readableTitle(pattern: string): string {
  return pattern
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(/\s+:/g, ":");
}

/** Compare the settings inside each group. */
export function findOutliers(groups: QuizComparisonGroup[]): QuizOutlier[] {
  const outliers: QuizOutlier[] = [];

  for (const group of groups) {
    if (group.quizzes.length < 2) continue;

    for (const setting of QUIZ_SETTINGS) {
      const values = group.quizzes.map((quiz) => ({
        quiz,
        value: quiz.quiz ? setting.read(quiz.quiz) : undefined,
      }));

      const stated = values.filter((entry) => entry.value !== undefined);
      if (stated.length < 2) continue;

      const counts = new Map<string, number>();
      for (const entry of stated) {
        counts.set(entry.value!, (counts.get(entry.value!) ?? 0) + 1);
      }

      let majority = "";
      let majorityCount = 0;
      for (const [value, count] of counts) {
        if (count > majorityCount) {
          majority = value;
          majorityCount = count;
        }
      }

      const differing = stated
        .filter((entry) => entry.value !== majority)
        .map((entry) => ({ quizId: entry.quiz.id, title: entry.quiz.title, value: entry.value! }));

      if (differing.length === 0) continue;

      outliers.push({
        groupId: group.id,
        groupTitle: group.title,
        settingId: setting.id,
        settingLabel: setting.label,
        majority,
        majorityCount,
        differing,
      });
    }
  }

  return outliers;
}

/** Pull the statements the instructions make about a quiz's settings. */
export function extractStatements(instructions: string): InstructionStatement[] {
  const statements: InstructionStatement[] = [];

  for (const sentence of sentences(instructions)) {
    statements.push(...statementsIn(sentence));
  }

  return statements;
}

/** Split a piece of text into sentences. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

/** The statements in one sentence. */
function statementsIn(sentence: string): InstructionStatement[] {
  const found: InstructionStatement[] = [];

  const attempts =
    /\b(?:(\d+|one|two|three|four|five|six|seven|eight|nine|ten|unlimited)\s+(?:attempts?|tries)|attempt\s+(?:this|the)\s+(\w+)\s+time|only\s+one\s+attempt)\b/i.exec(
      sentence,
    );
  if (attempts) {
    const word = attempts[1] ?? attempts[2];
    const number = word ? numberOf(word) : undefined;
    found.push({
      topic: "attempts",
      value: number === undefined ? attempts[0].trim() : number === -1 ? "Unlimited" : String(number),
      sentence,
      number,
    });
  }

  const time = /\b(\d+)\s*(?:-|\s)?\s*minutes?\b/i.exec(sentence);
  if (time && /time|timer|mins|complete|finish/i.test(sentence)) {
    found.push({ topic: "time-limit", value: `${time[1]} minutes`, sentence, number: Number(time[1]) });
  }

  const shuffle = /\b(shuffl\w+|random\s+order|in\s+a\s+random\s+order)\b/i.exec(sentence);
  if (shuffle) {
    const aboutQuestions = /\bquestion(s)?\b/i.test(sentence);
    const aboutAnswers = /\banswer(s)?\b/i.test(sentence);
    found.push({
      topic: "shuffling",
      value: shuffle[1],
      sentence,
      which: aboutAnswers && !aboutQuestions ? "answers" : aboutQuestions && !aboutAnswers ? "questions" : undefined,
    });
  }

  const points = /\b(\d+)\s*points?\b/i.exec(sentence);
  if (points) {
    found.push({ topic: "points", value: `${points[1]} points`, sentence, number: Number(points[1]) });
  }

  return found;
}

/** The number a word stands for. */
function numberOf(word: string): number {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  const lower = word.toLowerCase();
  if (lower === "unlimited") return -1;
  if (lower in words) return words[lower];

  const parsed = Number(lower);
  return Number.isFinite(parsed) ? parsed : (undefined as unknown as number);
}

/** Run every check in this family. */
export function checkQuizzes(review: AssessmentReview, groups: QuizComparisonGroup[], rules: ReviewRules): Finding[] {
  return [
    ...checkGroupOutliers(groups),
    ...checkInstructionAgreement(review, rules),
    ...checkLearnerRisk(review, rules),
    ...checkMissingSettings(review),
  ];
}

/** C1 — settings that differ inside a group. */
function checkGroupOutliers(groups: QuizComparisonGroup[]): Finding[] {
  const findings: Finding[] = [];

  for (const group of groups) {
    for (const setting of QUIZ_SETTINGS) {
      const values = group.quizzes.map((quiz) => ({
        quiz,
        value: quiz.quiz ? setting.read(quiz.quiz) : undefined,
      }));

      const stated = values.filter((entry) => entry.value !== undefined);
      if (stated.length < 2) continue;

      const counts = new Map<string, number>();
      for (const entry of stated) {
        counts.set(entry.value!, (counts.get(entry.value!) ?? 0) + 1);
      }

      let majority = "";
      let majorityCount = 0;
      for (const [value, count] of counts) {
        if (count > majorityCount) {
          majority = value;
          majorityCount = count;
        }
      }

      const differing = stated.filter((entry) => entry.value !== majority);
      if (differing.length === 0) continue;

      findings.push({
        id: `C1-${group.id}-${setting.id}`,
        check: "C1",
        family: "quizzes",
        title: `${majorityCount} of ${group.quizzes.length} ${group.title} quizzes have ${setting.label.toLowerCase()} set to "${majority}"; ${differing.length} differ`,
        values: [
          { label: "Most common", value: majority, source: "the quiz settings files" },
          {
            label: "The others",
            value: differing.map((entry) => `${entry.quiz.title}: ${entry.value}`).join("; "),
            source: "the quiz settings files",
          },
        ],
        itemIds: differing.map((entry) => entry.quiz.id),
        suggestedPriority: "medium",
        priorityReason: "Quizzes of the same kind are set up differently.",
        notes: [`The group was formed because: ${group.reason.toLowerCase()}.`],
        needsReview: true,
      });
    }
  }

  return findings;
}

/** C2 — what the instructions say against what the settings say. */
function checkInstructionAgreement(review: AssessmentReview, rules: ReviewRules): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (assessment.kind !== "quiz") continue;

    const quiz = assessment.quiz;
    if (!quiz) continue;

    const statements = extractStatements(assessment.instructions);

    for (const statement of statements) {
      const agreement = compareStatement(statement, quiz);

      if (agreement === null) continue;

      if (agreement.agree) continue;

      findings.push({
        id: `C2-${assessment.id}-${statement.topic}-${statement.number ?? statement.value}`,
        check: "C2",
        family: "quizzes",
        title: `The instructions for "${assessment.title}" say ${statement.value}, but the quiz is set to ${agreement.actual}`,
        values: [
          {
            label: "Instructions",
            value: statement.value,
            source: assessment.instructionsSource ?? "the quiz instructions",
          },
          { label: "Setting", value: agreement.actual, source: quiz.settingsSource ?? "the quiz settings" },
        ],
        itemIds: [assessment.id],
        suggestedPriority: "high",
        priorityReason: "Students are told one thing and given another.",
        notes: [
          `The instructions say: "${statement.sentence}"`,
          "The extraction is a reading of the text, not a certainty — check the sentence.",
        ],
        needsReview: true,
      });
    }

    findings.push(...defaultRuleFindings(assessment, statements, rules));
  }

  return findings;
}

/** What a statement says against what the setting says. */
function compareStatement(
  statement: InstructionStatement,
  quiz: QuizDetails,
): { agree: boolean; actual: string } | null {
  switch (statement.topic) {
    case "attempts": {
      if (statement.number === undefined) return null;
      const actual =
        quiz.allowedAttempts === undefined ? undefined : quiz.allowedAttempts < 0 ? -1 : quiz.allowedAttempts;
      if (actual === undefined) return { agree: false, actual: "not in export" };
      return { agree: actual === statement.number, actual: actual < 0 ? "unlimited attempts" : `${actual} attempt(s)` };
    }
    case "time-limit": {
      if (statement.number === undefined) return null;
      if (quiz.timeLimit === undefined) return { agree: false, actual: "not in export" };
      return { agree: quiz.timeLimit === statement.number, actual: `${quiz.timeLimit} minutes` };
    }
    case "shuffling": {
      const actual = statement.which === "questions" ? quiz.shuffleQuestions : quiz.shuffleAnswers;
      const saysShuffled = /shuffl/i.test(statement.value);
      return { agree: saysShuffled === actual, actual: actual ? "shuffled" : "not shuffled" };
    }
    case "points": {
      if (statement.number === undefined) return null;
      if (quiz.pointsPossible === undefined) return { agree: false, actual: "not in export" };
      return { agree: quiz.pointsPossible === statement.number, actual: `${formatPoints(quiz.pointsPossible)} points` };
    }
    default:
      return null;
  }
}

/** C3 — the rule the institution applies when the instructions are silent. */
function defaultRuleFindings(
  assessment: Assessment,
  statements: InstructionStatement[],
  rules: ReviewRules,
): Finding[] {
  const findings: Finding[] = [];
  const quiz = assessment.quiz;
  if (!quiz) return findings;

  const topics = new Set(statements.map((statement) => statement.topic));

  if (rules.defaults.shuffleAnswers && !topics.has("shuffling") && !quiz.shuffleAnswers) {
    findings.push({
      id: `C3-${assessment.id}-shuffle`,
      check: "C3",
      family: "quizzes",
      title: `The instructions for "${assessment.title}" say nothing about shuffling, and the quiz does not shuffle its answers`,
      values: [
        {
          label: "Instruction",
          value: "not mentioned",
          source: assessment.instructionsSource ?? "the quiz instructions",
        },
        { label: "Setting", value: "not shuffled", source: quiz.settingsSource ?? "the quiz settings" },
      ],
      itemIds: [assessment.id],
      suggestedPriority: "medium",
      priorityReason: "The institution's default rule applies, and the quiz does not meet it.",
      notes: ["The default rule was applied because the instructions are silent: answers should be shuffled."],
      needsReview: true,
    });
  }

  if (rules.defaults.reviewTimeLimit && !topics.has("time-limit")) {
    // The time limit is only reported when the institution asks for it.
  }

  return findings;
}

/** C4 — settings that could harm students. */
function checkLearnerRisk(review: AssessmentReview, rules: ReviewRules): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (assessment.kind !== "quiz") continue;

    const quiz = assessment.quiz;
    if (!quiz) continue;

    if (quiz.allowedAttempts === 0) {
      findings.push({
        id: `C4-${assessment.id}-attempts`,
        check: "C4",
        family: "quizzes",
        title: `"${assessment.title}" allows no attempts, so students cannot open it`,
        values: [{ label: "Attempts", value: "0", source: quiz.settingsSource ?? "the quiz settings" }],
        itemIds: [assessment.id],
        suggestedPriority: "high",
        priorityReason: "The setting blocks students from taking the quiz.",
        notes: [],
        needsReview: true,
      });
    }

    if (quiz.accessCode) {
      const mentionsCode = /access code|passcode|password/i.test(assessment.instructions);
      if (!mentionsCode) {
        findings.push({
          id: `C4-${assessment.id}-access-code`,
          check: "C4",
          family: "quizzes",
          title: `"${assessment.title}" has an access code that the instructions do not mention`,
          values: [
            { label: "Access code", value: "set", source: quiz.settingsSource ?? "the quiz settings" },
            {
              label: "Instructions",
              value: "not mentioned",
              source: assessment.instructionsSource ?? "the quiz instructions",
            },
          ],
          itemIds: [assessment.id],
          suggestedPriority: "high",
          priorityReason: "A student reading only the instructions would not know there is a code.",
          notes: [],
          needsReview: true,
        });
      }
    }

    if (quiz.showCorrectAnswers) {
      findings.push({
        id: `C4-${assessment.id}-correct-answers`,
        check: "C4",
        family: "quizzes",
        title: `"${assessment.title}" shows the correct answers to students`,
        values: [{ label: "Show correct answers", value: "Yes", source: quiz.settingsSource ?? "the quiz settings" }],
        itemIds: [assessment.id],
        suggestedPriority: "medium",
        priorityReason: "Students can see the answers after they take the quiz.",
        notes: [],
        needsReview: true,
      });
    }
  }

  void rules;
  return findings;
}

/** C5 — quizzes the export does not describe. */
function checkMissingSettings(review: AssessmentReview): Finding[] {
  const missing = review.assessments.filter(
    (assessment) => assessment.kind === "quiz" && !assessment.quiz?.settingsSource,
  );

  if (missing.length === 0) return [];

  return [
    {
      id: "C5-missing-settings",
      check: "C5",
      family: "quizzes",
      title: `${missing.length} quiz${missing.length === 1 ? " has" : "s have"} no settings in the export`,
      values: [{ label: "Quizzes without settings", value: String(missing.length), source: "the cartridge manifest" }],
      itemIds: missing.map((assessment) => assessment.id),
      suggestedPriority: "medium",
      priorityReason: "The settings have to be checked in Canvas; the export does not carry them.",
      notes: missing.map((assessment) => assessment.title),
      needsReview: true,
    },
  ];
}

/** A summary of a quiz, for the tables. */
export function describeQuiz(assessment: Assessment): {
  engine: string;
  source: string;
  questions: string;
  banks: string;
  readability: string;
} {
  const quiz = assessment.quiz;
  if (!quiz) {
    return {
      engine: "unknown",
      source: "not in export",
      questions: "not in export",
      banks: "none",
      readability: "not in export",
    };
  }

  const summary = summariseQuestions(quiz);

  return {
    engine: quiz.engine,
    source: quiz.contentSource,
    questions: summary.hasQuestions ? String(summary.inline + (summary.drawn ?? 0)) : "not in export",
    banks:
      quiz.selections.filter((selection) => selection.bankId).length > 0
        ? String(quiz.selections.filter((selection) => selection.bankId).length)
        : "none",
    readability: quiz.readability,
  };
}
