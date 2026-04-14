# lib/ — SRS Algorithm & Scoring (Phase 3)

## Files

| File | Purpose |
|---|---|
| `srs.ts` | `computeReview()` — SRS algorithm; computes `retentionScore` and `nextReviewAt` |
| `similarity.ts` | `evaluateAnswer()` — string similarity scoring; returns [0.0, 1.0] |
| `session.ts` | `buildSession()` — assembles a review session from DynamoDB data |
| `storySession.ts` | `groupSessionItems()`, `buildKnownVocab()`, `parseStoryBlanks()` — story-mode helpers |
| `progressActions.ts` | `submitAnswer()` — writes `ReviewEvent` + `UserWordProgress` after each answer |
| `authRetry.ts` | `withAuthRetry()` — retries a DynamoDB call once after an Amplify auth token refresh |

Full algorithm specifications: `docs/ALGORITHM.md` and `docs/ANSWER_EVALUATION.md`.

## Answer evaluation (`similarity.ts`)

`evaluateAnswer(input, expected)` uses Levenshtein distance with an **absolute edit-distance cap** before computing a ratio score:

- `maxAllowedEdits(maxLen)`: returns 1 for ≤4 chars, 2 for ≤7, 3 for >7.
- If `distance > maxAllowedEdits(maxLen)` → returns `SIMILARITY_FLOOR` (0.0) immediately.
- Otherwise returns a normalised ratio score in [0.0, 1.0].

`CORRECT_THRESHOLD = 0.8` in `progressActions.ts`. A ratio score must clear this bar AND pass the edit cap to count as correct.

The cap exists to prevent short-word false positives (e.g. "far" vs "fais": distance=2 on a 4-char word exceeds the cap of 1 → score 0.0 regardless of ratio).

## Session building (`session.ts`)

`buildSession(items, settings, todayNewCount, todayReviewCount)`:
- Separates due reviews (by `nextReviewAt`) from new words (no prior `UserWordProgress`).
- Enforces `maxNewWordsPerDay` and `maxReviewsPerDay` daily limits.
- Orders: due reviews first (ascending `nextReviewAt`), then new words (pre-loaded by `frequencyRank`, manual/import by insertion order).
- Words are pre-filtered to `settings.targetLanguage` before this function is called.

## Story-mode helpers (`storySession.ts`)

- `KNOWN_VOCAB_THRESHOLD`: `{ minReviewCount: 2, minRetentionScore: 3 }` — minimum bar for a word to appear in story context (not as a blank).
- `MAX_BLANKS_PER_STORY = 5`.
- `groupSessionItems(items)` — chunks session items into groups of up to 5 for story generation.
- `buildKnownVocab(allProgress, allWordMeanings, excludeIds)` — returns words meeting the known threshold, sorted by retention score descending, excluding current session targets.
- `parseStoryBlanks(storyText)` — splits story text into `text` and `blank` segments; blanks are in the format `___ [conjugated-form] (source-translation)`.

## Auth retry (`authRetry.ts`)

`withAuthRetry(fn)` wraps any async DynamoDB call. On an Amplify auth error it calls `fetchAuthSession()` to force a token refresh, then retries `fn` once. Used on all data-fetching pages to silently recover from the Amplify v6 token-refresh race condition that surfaces as "no current user" on page navigation.
