// Answer Evaluation Service
// See docs/ANSWER_EVALUATION.md for full specification.
//
// Single export: evaluateAnswer(studentResponse, expectedAnswer) → score [0.0, 1.0]
// The rest of the app must not implement scoring logic directly — always call this function.

const SIMILARITY_FLOOR = 0.0;

/**
 * Maximum number of single-character edits allowed before an answer is
 * immediately scored 0.0, regardless of the ratio-based score.
 *
 * Without this cap, the ratio formula is too permissive for short words:
 *   "far" vs "fais" → distance 2, maxLen 4, score 0.75 — incorrectly passing.
 *
 * Thresholds by length of the longer word:
 *   ≤ 4 chars  → max 1 edit  (e.g. "fais": must nearly be exact)
 *   ≤ 7 chars  → max 2 edits
 *   > 7 chars  → max 3 edits
 */
function maxAllowedEdits(maxLen: number): number {
  if (maxLen <= 4) return 1;
  if (maxLen <= 7) return 2;
  return 3;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Compares a student's response against the expected answer.
 * Returns a score in [0.0, 1.0] where 1.0 is a perfect match.
 *
 * Uses normalized Levenshtein similarity:
 *   score = 1 - (editDistance / max(len(a), len(b)))
 *
 * Both strings are trimmed and lowercased before comparison.
 * Accented characters are treated as distinct from their unaccented equivalents.
 */
export function evaluateAnswer(studentResponse: string, expectedAnswer: string): number {
  const a = normalize(studentResponse);
  const b = normalize(expectedAnswer);

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0; // both empty strings → perfect match

  const distance = levenshtein(a, b);

  // Hard cap: too many edits for this word length → flat 0.0.
  if (distance > maxAllowedEdits(maxLen)) return SIMILARITY_FLOOR;

  const score = 1 - distance / maxLen;
  return Math.max(SIMILARITY_FLOOR, score);
}
