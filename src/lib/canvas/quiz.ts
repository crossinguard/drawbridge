/**
 * Describing what a quiz is made of.
 *
 * A Canvas quiz gets its questions in more than one way: stored inside the
 * quiz, drawn from a bank, or both. The helpers here give one answer for
 * "how many questions does this quiz have", so the viewer, the report and
 * the review all say the same thing.
 */
import type { QuizDetails, QuizSelection } from "./types";

/** What a quiz's questions add up to. */
export interface QuizQuestionSummary {
  /** Questions stored inside the quiz itself. */
  inline: number;
  /** Questions drawn from banks. Undefined when the quiz draws from none. */
  drawn?: number;
  /** Points the questions add up to. Undefined when the export cannot say. */
  points?: number;
  /** True when the export does not say how many items a selection uses. */
  countUnknown: boolean;
  /** True when the quiz presents questions at all. */
  hasQuestions: boolean;
}

/** Summarise the questions a quiz presents. */
export function summariseQuestions(quiz: QuizDetails): QuizQuestionSummary {
  const inline = quiz.questionCount;
  const drawn = quiz.drawnCount;

  return {
    inline,
    drawn,
    points: quiz.pointsTotal,
    countUnknown: quiz.selectionCountUnknown,
    hasQuestions: inline > 0 || (drawn ?? 0) > 0,
  };
}

/** A short, plain description of how many questions a quiz presents. */
export function describeQuestionCount(summary: QuizQuestionSummary): string {
  const parts: string[] = [];
  if (summary.inline > 0) parts.push(`${summary.inline} in the quiz`);
  if (summary.drawn !== undefined && summary.drawn > 0) parts.push(`${summary.drawn} drawn from banks`);
  if (parts.length === 0) return "None found in the export";
  if (summary.countUnknown) return `${parts.join(", ")} (count not stated in the export)`;
  return parts.join(", ");
}

/** A short, plain description of where a quiz's questions come from. */
export function describeQuestionSource(quiz: QuizDetails): string {
  switch (quiz.contentSource) {
    case "items":
      return "Questions stored in the quiz";
    case "banks":
      return "Questions drawn from item banks";
    case "both":
      return "Questions stored in the quiz and drawn from item banks";
    default:
      return "No questions found in the export";
  }
}

/** The selections of a quiz that draw from a bank. */
export function bankSelections(quiz: QuizDetails): QuizSelection[] {
  return quiz.selections.filter((selection) => selection.bankId !== undefined);
}

/** A readable description of one selection. */
export function describeSelection(selection: QuizSelection): string {
  const count = selection.count === undefined ? "an unknown number of" : String(selection.count);
  const worth = selection.pointsPerItem === undefined ? "an unknown number of" : String(selection.pointsPerItem);
  const source = selection.bankTitle
    ? `from "${selection.bankTitle}"`
    : selection.bankId
      ? `from bank ${selection.bankId}`
      : "from the quiz's own questions";

  return `${count} question${selection.count === 1 ? "" : "s"} at ${worth} point${selection.pointsPerItem === 1 ? "" : "s"} each ${source}`;
}
