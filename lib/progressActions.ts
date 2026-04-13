// Progress Actions
// Handles the two DynamoDB writes that follow each answered card:
//   1. ReviewEvent.create  — immutable audit log entry
//   2. UserWordProgress.create / update — upsert SRS state
//
// Kept out of the UI layer so it can be reused in Phase 5 (story sessions).

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { evaluateAnswer } from './similarity';
import { computeReview } from './srs';

// Score threshold above which an answer counts as correct.
export const CORRECT_THRESHOLD = 0.6;

// --- Types ---

export interface ExistingProgress {
  /** UserWordProgress record id */
  id: string;
  retentionScore: number;
  lastReviewedAt: Date;
  reviewCount: number;
  correctCount: number;
}

export interface SubmitAnswerInput {
  client: ReturnType<typeof generateClient<Schema>>;
  wordMeaningId: string;
  /** The lemma stored on the WordMeaning record (the expected answer). */
  expectedAnswer: string;
  /** What the student typed. */
  studentResponse: string;
  /** Unix ms timestamp recorded when the question was first shown to the student. */
  questionStartedAt: number;
  /** Present for review items; absent for new words (triggers a cold-start SRS computation). */
  existingProgress?: ExistingProgress;
  /** Story text shown to the student, if any (empty string for Phase 4). */
  storyContext?: string;
  /**
   * The conjugated/declined form of the word as it appeared in the story blank.
   * When provided, the answer is evaluated against both this form and the lemma
   * (expectedAnswer), and the higher score is used. Absent in Phase 4.
   */
  acceptedConjugatedForm?: string;
}

export interface SubmitAnswerOutput {
  responseScore: number;
  responseTimeMs: number;
  wasCorrect: boolean;
  newRetentionScore: number;
  nextReviewAt: Date;
}

// --- Action ---

/**
 * Evaluates a student's typed answer, runs the SRS algorithm, and persists
 * both the ReviewEvent log entry and the updated UserWordProgress record.
 *
 * Both DynamoDB writes are fired concurrently with Promise.all.
 * Throws if either write fails — the caller is responsible for error handling.
 */
export async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerOutput> {
  const {
    client,
    wordMeaningId,
    expectedAnswer,
    studentResponse,
    questionStartedAt,
    existingProgress,
    storyContext = '',
    acceptedConjugatedForm,
  } = input;

  const responseTimeMs = Date.now() - questionStartedAt;
  // Accept either the lemma or the conjugated/declined story form — use the better score.
  const scoreVsLemma      = evaluateAnswer(studentResponse, expectedAnswer);
  const scoreVsConjugated = acceptedConjugatedForm
    ? evaluateAnswer(studentResponse, acceptedConjugatedForm)
    : 0;
  const responseScore = Math.max(scoreVsLemma, scoreVsConjugated);
  const wasCorrect    = responseScore >= CORRECT_THRESHOLD;

  const { retentionScore: newRetentionScore, nextReviewAt } = computeReview({
    initialResponse: { responseScore, responseTimeMs },
    previousProgress: existingProgress
      ? {
          retentionScore: existingProgress.retentionScore,
          lastReviewedAt: existingProgress.lastReviewedAt,
        }
      : undefined,
  });

  const now = new Date().toISOString();

  const reviewEventWrite = client.models.ReviewEvent.create({
    wordMeaningId,
    wasCorrect,
    responseScore,
    responseTimeMs,
    storyContext,
  });

  const progressWrite = existingProgress
    ? client.models.UserWordProgress.update({
        id: existingProgress.id,
        retentionScore: newRetentionScore,
        nextReviewAt: nextReviewAt.toISOString(),
        lastReviewedAt: now,
        reviewCount: existingProgress.reviewCount + 1,
        correctCount: existingProgress.correctCount + (wasCorrect ? 1 : 0),
      })
    : client.models.UserWordProgress.create({
        wordMeaningId,
        retentionScore: newRetentionScore,
        nextReviewAt: nextReviewAt.toISOString(),
        lastReviewedAt: now,
        reviewCount: 1,
        correctCount: wasCorrect ? 1 : 0,
        introducedAt: now,
      });

  const [reviewResult, progressResult] = await Promise.all([reviewEventWrite, progressWrite]);

  if (reviewResult.errors?.length)  throw new Error(reviewResult.errors[0].message);
  if (progressResult.errors?.length) throw new Error(progressResult.errors[0].message);

  return { responseScore, responseTimeMs, wasCorrect, newRetentionScore, nextReviewAt };
}
