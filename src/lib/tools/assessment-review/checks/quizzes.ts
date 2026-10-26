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

import {
  makeFinding,
  makeStat,
  points as formatPoints,
  type CheckResults,
  type Confidence,
  type Finding,
  type ReviewOverrides,
} from "@/lib/tools/assessment-review/findings";
import type { Assessment, AssessmentReview } from "@/lib/tools/assessment-review/model";
import { priorityFor, type ReviewSettings } from "@/lib/tools/assessment-review/settings";
import { titlePattern } from "@/lib/tools/assessment-review/usage";

/** One setting the review compares between quizzes. */
export interface QuizSetting {
  id: string;
  label: string;
  /** A shorter label, for the places where space is tight. */
  short: string;
  /** The value of the setting for one quiz. */
  read: (quiz: QuizDetails) => string | undefined;
}

/** The settings the review compares. */
export const QUIZ_SETTINGS: readonly QuizSetting[] = [
  {
    id: "attempts",
    short: "attempts",
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
    short: "time limit",
    label: "Time limit",
    read: (quiz) => (quiz.timeLimit === undefined ? undefined : `${quiz.timeLimit} minutes`),
  },
  {
    id: "shuffleQuestions",
    short: "shuffle Q",
    label: "Shuffle questions",
    read: (quiz) => (quiz.shuffleQuestions ? "Yes" : "No"),
  },
  {
    id: "shuffleAnswers",
    short: "shuffle A",
    label: "Shuffle answers",
    read: (quiz) => (quiz.shuffleAnswers ? "Yes" : "No"),
  },
  {
    id: "oneQuestionAtATime",
    short: "one at a time",
    label: "One question at a time",
    read: (quiz) => (quiz.oneQuestionAtATime ? "Yes" : "No"),
  },
  {
    id: "scoringPolicy",
    short: "scoring",
    label: "Scoring",
    read: (quiz) => quiz.scoringPolicy,
  },
  {
    id: "showCorrectAnswers",
    short: "show answers",
    label: "Show correct answers",
    read: (quiz) => (quiz.showCorrectAnswers ? "Yes" : "No"),
  },
  {
    id: "lockdownBrowser",
    short: "lockdown",
    label: "Lockdown browser",
    read: (quiz) => (quiz.lockdownBrowser ? "Required" : "Not required"),
  },
  {
    id: "points",
    short: "points",
    label: "Points",
    read: (quiz) => (quiz.pointsPossible === undefined ? undefined : formatPoints(quiz.pointsPossible)),
  },
  {
    id: "available",
    short: "available",
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

/**
 * A set of quizzes that are set up the same way.
 *
 * A family is the unit the export writes about: the 14 quizzes of a course
 * that share every setting are one row, not 14.
 */
export interface QuizFamily {
  /** A stable id for the family. */
  id: string;
  /** The comparison group the family sits in. */
  groupId: string;
  /** The comparison group's title. */
  groupTitle: string;
  /** The quizzes in the family. */
  members: Assessment[];
  /** The settings every member shares. */
  settings: { id: string; label: string; short: string; value: string }[];
  /** The members of the group that are not in this family, and what differs. */
  exceptions: { title: string; setting: string; value: string }[];
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
 * quiz engine, its points and its assignment group are used instead. Which of
 * those rules apply is a setting the reviewer controls.
 */
export function suggestGroups(review: AssessmentReview, settings: ReviewSettings): QuizComparisonGroup[] {
  const quizzes = review.assessments.filter((assessment) => assessment.kind === "quiz");
  const rules = settings.quizGrouping;

  const groups = new Map<string, QuizComparisonGroup>();

  if (rules.byTitlePattern) {
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
  } else {
    for (const quiz of quizzes) {
      groups.set(`quiz-${quiz.id}`, {
        id: `quiz-${quiz.id}`,
        title: quiz.title,
        quizzes: [quiz],
        reason: "The title pattern rule is switched off",
      });
    }
  }

  // Quizzes whose title stands alone may still belong with others.
  const secondary = new Map<string, Assessment[]>();

  for (const group of groups.values()) {
    if (group.quizzes.length > 1) continue;

    const quiz = group.quizzes[0];
    const key = secondaryKey(quiz, rules);
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
function secondaryKey(quiz: Assessment, rules: ReviewSettings["quizGrouping"]): string | undefined {
  const engine = quiz.quiz?.engine;
  const parts: string[] = [];

  if (rules.byEngineAndPoints) {
    if (!engine) return undefined;
    parts.push(engine, String(quiz.pointsPossible ?? "?"));
  }

  if (rules.byAssignmentGroup) parts.push(quiz.groupTitle ?? "?");
  if (rules.byPoints) parts.push(String(quiz.pointsPossible ?? "?"));

  if (parts.length === 0) return undefined;
  return `kind:${parts.join(":")}`;
}

/** A readable name for a title pattern. */
function readableTitle(pattern: string): string {
  return pattern
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(/\s+:/g, ":");
}

/**
 * Collapse the quizzes into families.
 *
 * A family is a set of quizzes that are set up the same way. The members of a
 * comparison group that are not in the family are listed as exceptions, with
 * the setting they differ on.
 */
export function buildFamilies(groups: QuizComparisonGroup[]): QuizFamily[] {
  const families: QuizFamily[] = [];

  for (const group of groups) {
    const buckets = new Map<string, Assessment[]>();

    for (const quiz of group.quizzes) {
      const signature = QUIZ_SETTINGS.map((setting) =>
        quiz.quiz ? (setting.read(quiz.quiz) ?? "not in export") : "not in export",
      ).join("|");

      const list = buckets.get(signature) ?? [];
      list.push(quiz);
      buckets.set(signature, list);
    }

    // The largest bucket is the family's norm; the others are exceptions.
    const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
    const largest = ordered[0];

    for (const [signature, members] of ordered) {
      const settings = QUIZ_SETTINGS.map((setting, index) => ({
        id: setting.id,
        label: setting.label,
        short: setting.short,
        value: signature.split("|")[index] ?? "not in export",
      }));

      const exceptions: { title: string; setting: string; value: string }[] = [];

      if (signature !== largest?.[0]) {
        for (const member of members) {
          for (const setting of QUIZ_SETTINGS) {
            const value = member.quiz ? (setting.read(member.quiz) ?? "not in export") : "not in export";
            const norm = settings.find((entry) => entry.id === setting.id)?.value ?? "not in export";
            if (value === norm) continue;
            exceptions.push({ title: member.title, setting: setting.label, value });
          }
        }
      }

      families.push({
        id: `F${families.length + 1}`,
        groupId: group.id,
        groupTitle: group.title,
        members,
        settings,
        exceptions,
      });
    }
  }

  return families;
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
export function checkQuizzes(
  review: AssessmentReview,
  groups: QuizComparisonGroup[],
  settings: ReviewSettings,
): CheckResults {
  const findings: Finding[] = [
    ...checkGroupOutliers(groups, settings),
    ...checkInstructionAgreement(review, settings),
    ...checkDefaultRule(review, settings),
    ...checkLearnerRisk(review, settings),
    ...checkMissingSettings(review, settings),
  ];

  return {
    findings,
    candidates: [],
    stats: [groupOutlierStat(groups)],
  };
}

/** C1 — settings that differ inside a group. */
function checkGroupOutliers(groups: QuizComparisonGroup[], settings: ReviewSettings): Finding[] {
  const findings: Finding[] = [];

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

      const differing = stated.filter((entry) => entry.value !== majority);
      if (differing.length === 0) continue;

      findings.push(
        makeFinding({
          id: `C1-${group.id}-${setting.id}`,
          check: "C1",
          family: "quizzes",
          objectType: "quiz-family",
          objectId: group.id,
          objectName: group.title,
          statement: `${majorityCount} of the ${group.quizzes.length} quizzes in "${group.title}" ${majorityCount === 1 ? "has" : "have"} ${setting.label.toLowerCase()} set to "${majority}". ${differing.length} differ${differing.length === 1 ? "s" : ""}.`,
          values: [
            { label: "Most common", value: majority, source: "the quiz settings files" },
            {
              label: "The others",
              value: differing.map((entry) => `${entry.quiz.title}: ${entry.value}`).join("; "),
              source: "the quiz settings files",
            },
          ],
          affected: differing.map((entry) => entry.quiz.id),
          suggestedPriority: priorityFor(settings, "quizzes", "medium"),
          priorityReason: "Quizzes of the same kind are set up differently.",
          notes: [`The group was formed because: ${group.reason.toLowerCase()}.`],
        }),
      );
    }
  }

  return findings;
}

/** C2 — what the instructions say against what the settings say. */
function checkInstructionAgreement(review: AssessmentReview, settings: ReviewSettings): Finding[] {
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

      // A number that reads the same on both sides is confirmed by a rule. A
      // reading that depends on which word the sentence used is not.
      const confidence: Confidence = statement.topic === "shuffling" ? "low" : "medium";

      findings.push(
        makeFinding({
          id: `C2-${assessment.id}-${statement.topic}-${statement.number ?? statement.value}`,
          check: "C2",
          family: "quizzes",
          objectType: "quiz",
          objectId: assessment.id,
          objectName: assessment.title,
          statement: `The instructions for "${assessment.title}" say ${statement.value}, and the quiz is set to ${agreement.actual}.`,
          values: [
            {
              label: "Instructions",
              value: statement.value,
              source: assessment.instructionsSource ?? "the quiz instructions",
            },
            { label: "Setting", value: agreement.actual, source: quiz.settingsSource ?? "the quiz settings" },
          ],
          suggestedPriority: priorityFor(settings, "quizzes", "high"),
          priorityReason: "Students are told one thing and given another.",
          notes: [
            `The instructions say: "${statement.sentence}"`,
            "The extraction is a reading of the text, not a certainty — check the sentence.",
          ],
          confidence,
        }),
      );
    }
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

/**
 * C3 — the rule that applies when the instructions are silent.
 *
 * The rule is one cause, so it is one finding, however many quizzes it
 * touches. The quizzes it touches are listed in the finding.
 */
function checkDefaultRule(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  const findings: Finding[] = [];
  const quiz = settings.quizDefaults;

  const silent = new Map<string, Assessment[]>();
  const quiet = new Map<string, Assessment[]>();

  for (const assessment of review.assessments) {
    if (assessment.kind !== "quiz") continue;

    const details = assessment.quiz;
    if (!details) continue;

    const topics = new Set(extractStatements(assessment.instructions).map((statement) => statement.topic));

    if (quiz.shuffleAnswers && !topics.has("shuffling") && !details.shuffleAnswers) {
      const list = silent.get("shuffle") ?? [];
      list.push(assessment);
      silent.set("shuffle", list);
    }

    if (quiz.reviewAttempts && !topics.has("attempts") && details.allowedAttempts !== undefined) {
      const list = quiet.get("attempts") ?? [];
      list.push(assessment);
      quiet.set("attempts", list);
    }

    if (quiz.reviewTimeLimit && !topics.has("time-limit") && details.timeLimit !== undefined) {
      const list = quiet.get("time-limit") ?? [];
      list.push(assessment);
      quiet.set("time-limit", list);
    }
  }

  const shuffling = silent.get("shuffle");
  if (shuffling && shuffling.length > 0) {
    findings.push(
      makeFinding({
        id: "C3-shuffle",
        check: "C3",
        family: "quizzes",
        objectType: "quiz-family",
        objectId: "",
        objectName: "The course's quizzes",
        statement: `${shuffling.length} quiz/quizzes say nothing about shuffling in their instructions, and do not shuffle their answers.`,
        values: [
          {
            label: "Instruction",
            value: "not mentioned",
            source: "the quiz instructions",
          },
          { label: "Setting", value: "not shuffled", source: "the quiz settings files" },
        ],
        affected: shuffling.map((assessment) => assessment.id),
        suggestedPriority: priorityFor(settings, "quizzes", "medium"),
        priorityReason: "The institution's default rule applies, and the quizzes do not meet it.",
        notes: [
          "The default rule was applied because the instructions are silent: answers should be shuffled.",
          ...shuffling.map((assessment) => assessment.title),
        ],
      }),
    );
  }

  const attempts = quiet.get("attempts");
  if (attempts && attempts.length > 0) {
    findings.push(
      makeFinding({
        id: "C3-attempts",
        check: "C3",
        family: "quizzes",
        objectType: "quiz-family",
        objectId: "",
        objectName: "The course's quizzes",
        statement: `${attempts.length} quiz/quizzes say nothing about attempts in their instructions, and the reviewer asked for the number of attempts to be checked.`,
        values: [
          { label: "Instruction", value: "not mentioned", source: "the quiz instructions" },
          {
            label: "Setting",
            value: attempts.map((assessment) => `${assessment.title}: ${assessment.quiz?.allowedAttempts}`).join("; "),
            source: "the quiz settings files",
          },
        ],
        affected: attempts.map((assessment) => assessment.id),
        suggestedPriority: priorityFor(settings, "quizzes", "low"),
        priorityReason: "The reviewer asked for the number of attempts to be checked when the instructions are silent.",
      }),
    );
  }

  const timeLimit = quiet.get("time-limit");
  if (timeLimit && timeLimit.length > 0) {
    findings.push(
      makeFinding({
        id: "C3-time-limit",
        check: "C3",
        family: "quizzes",
        objectType: "quiz-family",
        objectId: "",
        objectName: "The course's quizzes",
        statement: `${timeLimit.length} quiz/quizzes say nothing about the time limit in their instructions, and the reviewer asked for the time limit to be checked.`,
        values: [
          { label: "Instruction", value: "not mentioned", source: "the quiz instructions" },
          {
            label: "Setting",
            value: timeLimit
              .map((assessment) => `${assessment.title}: ${assessment.quiz?.timeLimit} minutes`)
              .join("; "),
            source: "the quiz settings files",
          },
        ],
        affected: timeLimit.map((assessment) => assessment.id),
        suggestedPriority: priorityFor(settings, "quizzes", "low"),
        priorityReason: "The reviewer asked for the time limit to be checked when the instructions are silent.",
      }),
    );
  }

  return findings;
}

/** C4 — settings that could harm students. */
function checkLearnerRisk(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  const findings: Finding[] = [];

  for (const assessment of review.assessments) {
    if (assessment.kind !== "quiz") continue;

    const quiz = assessment.quiz;
    if (!quiz) continue;

    if (quiz.allowedAttempts === 0) {
      findings.push(
        makeFinding({
          id: `C4-${assessment.id}-attempts`,
          check: "C4",
          family: "quizzes",
          objectType: "quiz",
          objectId: assessment.id,
          objectName: assessment.title,
          statement: `"${assessment.title}" allows no attempts, so students cannot open it.`,
          values: [{ label: "Attempts", value: "0", source: quiz.settingsSource ?? "the quiz settings" }],
          suggestedPriority: priorityFor(settings, "quizzes", "high"),
          priorityReason: "The setting blocks students from taking the quiz.",
        }),
      );
    }

    if (quiz.accessCode) {
      const mentionsCode = /access code|passcode|password/i.test(assessment.instructions);
      if (!mentionsCode) {
        findings.push(
          makeFinding({
            id: `C4-${assessment.id}-access-code`,
            check: "C4",
            family: "quizzes",
            objectType: "quiz",
            objectId: assessment.id,
            objectName: assessment.title,
            statement: `"${assessment.title}" has an access code that the instructions do not mention.`,
            values: [
              { label: "Access code", value: "set", source: quiz.settingsSource ?? "the quiz settings" },
              {
                label: "Instructions",
                value: "not mentioned",
                source: assessment.instructionsSource ?? "the quiz instructions",
              },
            ],
            suggestedPriority: priorityFor(settings, "quizzes", "high"),
            priorityReason: "A student reading only the instructions would not know there is a code.",
          }),
        );
      }
    }

    if (quiz.showCorrectAnswers) {
      findings.push(
        makeFinding({
          id: `C4-${assessment.id}-correct-answers`,
          check: "C4",
          family: "quizzes",
          objectType: "quiz",
          objectId: assessment.id,
          objectName: assessment.title,
          statement: `"${assessment.title}" shows the correct answers to students.`,
          values: [{ label: "Show correct answers", value: "Yes", source: quiz.settingsSource ?? "the quiz settings" }],
          suggestedPriority: priorityFor(settings, "quizzes", "medium"),
          priorityReason: "Students can see the answers after they take the quiz.",
        }),
      );
    }
  }

  return findings;
}

/** C5 — quizzes the export does not describe. */
function checkMissingSettings(review: AssessmentReview, settings: ReviewSettings): Finding[] {
  const missing = review.assessments.filter(
    (assessment) => assessment.kind === "quiz" && !assessment.quiz?.settingsSource,
  );

  if (missing.length === 0) return [];

  return [
    makeFinding({
      id: "C5-missing-settings",
      check: "C5",
      family: "quizzes",
      objectType: "quiz",
      objectId: "",
      objectName: "The course's quizzes",
      statement: `${missing.length} quiz${missing.length === 1 ? " has" : "s have"} no settings in the export.`,
      values: [{ label: "Quizzes without settings", value: String(missing.length), source: "the cartridge manifest" }],
      affected: missing.map((assessment) => assessment.id),
      suggestedPriority: priorityFor(settings, "quizzes", "medium"),
      priorityReason: "The settings have to be checked in Canvas; the export does not carry them.",
      notes: missing.map((assessment) => assessment.title),
    }),
  ];
}

/** C1 — how many quizzes in a group are set up like the rest of it. */
function groupOutlierStat(groups: QuizComparisonGroup[]) {
  const inGroups = groups.filter((group) => group.quizzes.length > 1).flatMap((group) => group.quizzes);
  const exceptions = new Set<string>();

  for (const group of groups) {
    if (group.quizzes.length < 2) continue;

    for (const setting of QUIZ_SETTINGS) {
      const values = group.quizzes
        .map((quiz) => (quiz.quiz ? setting.read(quiz.quiz) : undefined))
        .filter((value): value is string => value !== undefined);

      if (values.length < 2) continue;

      const counts = new Map<string, number>();
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

      let majority = "";
      let majorityCount = 0;
      for (const [value, count] of counts) {
        if (count > majorityCount) {
          majority = value;
          majorityCount = count;
        }
      }

      for (const quiz of group.quizzes) {
        const value = quiz.quiz ? setting.read(quiz.quiz) : undefined;
        if (value !== undefined && value !== majority) exceptions.add(quiz.title);
      }
    }
  }

  const total = new Set(inGroups.map((quiz) => quiz.id)).size;

  return makeStat({
    check: "C1",
    family: "quizzes",
    description: "Quizzes in a comparison group set up the same way as the rest of their group",
    total,
    passed: total - exceptions.size,
    exceptions: [...exceptions],
  });
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

/** The group a quiz is in, after the reviewer's changes. */
export function groupOf(groups: QuizComparisonGroup[], quizId: string, overrides: ReviewOverrides): string | undefined {
  const override = overrides.quizGroups.get(quizId);
  if (override) return override;

  for (const group of groups) {
    if (group.quizzes.some((quiz) => quiz.id === quizId)) return group.id;
  }

  return undefined;
}

/** The groups with the reviewer's changes applied. */
export function applyGroupOverrides(groups: QuizComparisonGroup[], overrides: ReviewOverrides): QuizComparisonGroup[] {
  if (overrides.quizGroups.size === 0) return groups;

  const moved = new Map<string, string>();
  for (const [quizId, groupId] of overrides.quizGroups) moved.set(quizId, groupId);

  const result = groups.map((group) => ({ ...group, quizzes: [...group.quizzes] }));

  for (const group of result) {
    group.quizzes = group.quizzes.filter((quiz) => (moved.get(quiz.id) ?? group.id) === group.id);
  }

  const byId = new Map(result.map((group) => [group.id, group]));

  for (const [quizId, groupId] of moved) {
    const target = byId.get(groupId);
    if (!target) continue;

    const source = result.find((group) => group.quizzes.some((quiz) => quiz.id === quizId));
    const quiz = source?.quizzes.find((entry) => entry.id === quizId);
    if (quiz && !target.quizzes.some((entry) => entry.id === quizId)) target.quizzes.push(quiz);
  }

  return result.filter((group) => group.quizzes.length > 0);
}
