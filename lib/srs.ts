// SRS Algorithm Service
// See docs/ALGORITHM.md for full specification.
//
// Single export: computeReview(input) → { retentionScore, nextReviewAt }

// --- Parameters (tune here, nowhere else) ---
const COLD_START_MAX_DAYS         = 45;
const MIN_RETENTION_DAYS          = 1;
const RESPONSE_TIME_THRESHOLD_MS  = 15_000;
const RESPONSE_TIME_PENALTY_STEP_MS  = 10_000;
const RESPONSE_TIME_PENALTY_PER_STEP = 0.10;
const NEXT_REVIEW_VARIATION       = 0.20;

// --- Types ---

export interface InitialResponse {
  /** Quality of the answer: 0.0 = completely wrong, 1.0 = perfect. */
  responseScore: number;
  /** Time taken to produce the answer, in milliseconds. */
  responseTimeMs: number;
}

export interface PreviousProgress {
  /** Retention score from the last review session, in days. */
  retentionScore: number;
  /** When the word was last reviewed. */
  lastReviewedAt: Date;
}

export interface SRSInput {
  initialResponse: InitialResponse;
  /**
   * Prior SRS state for this word. Absent on the very first review (cold start).
   */
  previousProgress?: PreviousProgress;
}

export interface SRSOutput {
  /** Updated retention estimate, in days. Minimum 1. */
  retentionScore: number;
  /** Scheduled datetime for the next review. */
  nextReviewAt: Date;
}

// --- Algorithm ---

/**
 * Computes the updated retention score and next review date after a review event.
 * Pure function — no side effects, no I/O.
 */
export function computeReview(input: SRSInput): SRSOutput {
  const { responseScore, responseTimeMs } = input.initialResponse;

  // Step 1: Base retention score
  let retentionScore: number;

  if (!input.previousProgress) {
    // Cold start — first time this word is answered.
    // Wrong or weak (< 80%): review tomorrow so the student sees it again quickly.
    // Correct (≥ 80%): proportional reward up to COLD_START_MAX_DAYS.
    if (responseScore < 0.8) {
      retentionScore = 1;
    } else {
      retentionScore = Math.round(responseScore * COLD_START_MAX_DAYS);
    }
  } else {
    // Update: linear interpolation between ×0.5 (score=0) and ×2.0 (score=1)
    const multiplier = 0.5 + 1.5 * responseScore;
    retentionScore = Math.round(input.previousProgress.retentionScore * multiplier);
  }

  // Step 2: Response time penalty (applied to responseTimeMs of the initial response)
  if (responseTimeMs > RESPONSE_TIME_THRESHOLD_MS) {
    const extraMs      = responseTimeMs - RESPONSE_TIME_THRESHOLD_MS;
    const penaltySteps = Math.floor(extraMs / RESPONSE_TIME_PENALTY_STEP_MS);
    const penaltyFactor = Math.max(0, 1 - RESPONSE_TIME_PENALTY_PER_STEP * penaltySteps);
    retentionScore = Math.round(retentionScore * penaltyFactor);
  }

  // Step 3: Enforce minimum
  retentionScore = Math.max(MIN_RETENTION_DAYS, retentionScore);

  // Step 4: nextReviewAt = today + retentionScore days ± NEXT_REVIEW_VARIATION
  const variation     = (Math.random() * 2 - 1) * NEXT_REVIEW_VARIATION;
  const daysUntilNext = retentionScore * (1 + variation);
  const nextReviewAt  = new Date(Date.now() + daysUntilNext * 24 * 60 * 60 * 1000);

  return { retentionScore, nextReviewAt };
}
