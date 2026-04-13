// Session Builder
// Pure function — no side effects, no I/O, no Amplify imports.
// Takes pre-fetched DynamoDB records and produces an ordered list of SessionItems
// for one review session, respecting daily limits.

// --- Types ---

export type WordType = 'new' | 'review';

export interface SessionItem {
  wordMeaningId: string;
  lemma: string;
  meaning: string;
  targetLanguage: string;
  exampleSentence: string | null;
  wordType: WordType;
  /** Present for 'review' items; absent for 'new' words (no progress record yet). */
  existingProgress?: {
    /** UserWordProgress record id — needed for the update call in progressActions. */
    id: string;
    retentionScore: number;
    lastReviewedAt: Date;
    reviewCount: number;
    correctCount: number;
  };
}

// Minimal shape of a WordMeaning record as returned by the Amplify client.
export interface WordMeaningRecord {
  id: string;
  lemma: string;
  meaning: string;
  targetLanguage: string;
  sourceLanguage: string;
  exampleSentence?: string | null;
  frequencyRank?: number | null;
  sourceType?: 'preloaded' | 'manual' | 'text_import' | null;
  createdAt?: string | null;
}

// Minimal shape of a UserWordProgress record as returned by the Amplify client.
export interface UserWordProgressRecord {
  id: string;
  wordMeaningId: string;
  retentionScore?: number | null;
  nextReviewAt: string;       // ISO datetime
  lastReviewedAt?: string | null;
  reviewCount?: number | null;
  correctCount?: number | null;
  introducedAt: string;       // ISO datetime — set once at creation
  createdAt?: string | null;
}

export interface BuildSessionInput {
  allWordMeanings: WordMeaningRecord[];
  allProgress: UserWordProgressRecord[];
  /** Count of ReviewEvent records already created today (fetched separately by the page). */
  reviewsCompletedToday: number;
  maxNewWordsPerDay: number;
  maxReviewsPerDay: number;
  /** Start of the user's local calendar day, as a UTC timestamp in ms. */
  todayStartMs: number;
  /** End of the user's local calendar day, as a UTC timestamp in ms. */
  todayEndMs: number;
  /** Current timestamp in ms (pass Date.now() from the caller). */
  nowMs: number;
}

export type EmptyReason = 'daily_limit_reached' | 'nothing_due' | 'no_vocabulary';

export interface BuildSessionOutput {
  items: SessionItem[];
  reviewCount: number;
  newCount: number;
  emptyReason?: EmptyReason;
}

// --- Algorithm ---

/**
 * Builds an ordered list of SessionItems for one review session.
 * Pure function — call with pre-fetched records and current timestamps.
 *
 * Ordering: due reviews (most overdue first) followed by new words
 * (pre-loaded by frequencyRank, then user-added by createdAt).
 */
export function buildSession(input: BuildSessionInput): BuildSessionOutput {
  const {
    allWordMeanings,
    allProgress,
    reviewsCompletedToday,
    maxNewWordsPerDay,
    maxReviewsPerDay,
    todayStartMs,
    nowMs,
  } = input;

  if (allWordMeanings.length === 0) {
    return { items: [], reviewCount: 0, newCount: 0, emptyReason: 'no_vocabulary' };
  }

  // Index progress records by wordMeaningId for O(1) lookup.
  const progressByWordId = new Map<string, UserWordProgressRecord>();
  for (const p of allProgress) {
    progressByWordId.set(p.wordMeaningId, p);
  }

  // Words introduced to the student today (progress record created today).
  const introducedTodayCount = allProgress.filter(
    (p) => new Date(p.introducedAt).getTime() >= todayStartMs
  ).length;

  const reviewSlotsLeft = Math.max(0, maxReviewsPerDay - reviewsCompletedToday);
  const newSlotsLeft    = Math.max(0, maxNewWordsPerDay - introducedTodayCount);

  if (reviewSlotsLeft === 0 && newSlotsLeft === 0) {
    return { items: [], reviewCount: 0, newCount: 0, emptyReason: 'daily_limit_reached' };
  }

  // ── Due reviews ────────────────────────────────────────────────────────────
  // Words the student has seen before and whose nextReviewAt is in the past.

  const dueProgress = allProgress
    .filter((p) => new Date(p.nextReviewAt).getTime() <= nowMs)
    .sort((a, b) => new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime());

  const reviewItems: SessionItem[] = [];

  for (const p of dueProgress) {
    if (reviewItems.length >= reviewSlotsLeft) break;
    const wm = allWordMeanings.find((w) => w.id === p.wordMeaningId);
    if (!wm) continue;

    reviewItems.push({
      wordMeaningId: wm.id,
      lemma: wm.lemma,
      meaning: wm.meaning,
      targetLanguage: wm.targetLanguage,
      exampleSentence: wm.exampleSentence ?? null,
      wordType: 'review',
      existingProgress: {
        id: p.id,
        retentionScore: p.retentionScore ?? 1,
        lastReviewedAt: p.lastReviewedAt ? new Date(p.lastReviewedAt) : new Date(p.createdAt!),
        reviewCount: p.reviewCount ?? 0,
        correctCount: p.correctCount ?? 0,
      },
    });
  }

  // ── New words ──────────────────────────────────────────────────────────────
  // Words the student has never seen (no progress record exists).

  const unseenWords = allWordMeanings.filter((wm) => !progressByWordId.has(wm.id));

  // Pre-loaded words first, ordered by frequencyRank ascending (most frequent = lowest rank number).
  const preloaded = unseenWords
    .filter((wm) => wm.sourceType === 'preloaded')
    .sort((a, b) => (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity));

  // User-added words second, ordered by createdAt ascending (oldest first).
  const userAdded = unseenWords
    .filter((wm) => wm.sourceType !== 'preloaded')
    .sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    });

  const orderedNew = [...preloaded, ...userAdded];
  const newItems: SessionItem[] = [];

  for (const wm of orderedNew) {
    if (newItems.length >= newSlotsLeft) break;
    newItems.push({
      wordMeaningId: wm.id,
      lemma: wm.lemma,
      meaning: wm.meaning,
      targetLanguage: wm.targetLanguage,
      exampleSentence: wm.exampleSentence ?? null,
      wordType: 'new',
      // existingProgress intentionally absent
    });
  }

  const items = [...reviewItems, ...newItems];

  if (items.length === 0) {
    // Progress records exist but nothing is due yet.
    return { items: [], reviewCount: 0, newCount: 0, emptyReason: 'nothing_due' };
  }

  return {
    items,
    reviewCount: reviewItems.length,
    newCount: newItems.length,
  };
}
