# SRS Algorithm Specification

## Overview

The spaced repetition algorithm computes two values after each review session:

- **`retentionScore`** — an estimate of how many days the student will retain this word meaning before forgetting it.
- **`nextReviewAt`** — the datetime when the word should next be surfaced for review.

The algorithm is implemented as a pure service function in `lib/srs.ts` with no side effects. It receives the review event data and returns the updated scheduling values. It is tested via `scripts/test-srs.ts`.

---

## Inputs

### Initial response — first attempt of the day
| Field | Type | Description |
|---|---|---|
| `responseScore` | `float` [0.0–1.0] | Quality of the answer. 0.0 = completely wrong, 1.0 = perfect. |
| `responseTimeMs` | `integer` | Time taken to answer in milliseconds. |

### Previous user progress — state before today (optional)
Absent when the word is being reviewed for the first time.

| Field | Type | Description |
|---|---|---|
| `retentionScore` | `integer` | Retention score from the last review session (days). |
| `lastReviewedAt` | `datetime` | When the word was last reviewed. |

### Today's review history — reserved for future refinement (not used yet)
| Field | Type | Description |
|---|---|---|
| `reviewCount` | `integer` | Number of attempts for this word today. |
| `avgResponseScore` | `float` | Average `responseScore` across all attempts today. |
| `avgResponseTimeMs` | `integer` | Average response time across all attempts today. |

---

## Outputs

| Field | Type | Constraints | Description |
|---|---|---|---|
| `retentionScore` | `integer` | min 1 | Updated retention estimate in days. |
| `nextReviewAt` | `datetime` | — | Scheduled datetime for the next review. |

---

## Algorithm — Step by Step

### Step 1: Compute base retention score

**Cold start** (no previous user progress):

```
retentionScore = Math.round(responseScore * COLD_START_MAX_DAYS)
```

Example: `responseScore = 0.7` → `Math.round(0.7 * 45)` = `32` days.

**With previous progress:**

The update multiplier is linearly interpolated between 0.5 (at `responseScore = 0`) and 2.0 (at `responseScore = 1.0`):

```
multiplier     = 0.5 + 1.5 * responseScore
retentionScore = Math.round(previousRetentionScore * multiplier)
```

| responseScore | multiplier | effect |
|---|---|---|
| 0.0 | 0.50 | halve retention (forgotten) |
| 0.5 | 1.25 | 25% increase |
| 1.0 | 2.00 | double retention (perfect) |

---

### Step 2: Apply response time penalty

If `responseTimeMs` exceeds the threshold, apply a 10% reduction per additional 10-second interval:

```
if responseTimeMs > RESPONSE_TIME_THRESHOLD_MS:
  extraMs       = responseTimeMs - RESPONSE_TIME_THRESHOLD_MS
  penaltySteps  = Math.floor(extraMs / RESPONSE_TIME_PENALTY_STEP_MS)
  penaltyFactor = 1 - (RESPONSE_TIME_PENALTY_PER_STEP * penaltySteps)
  retentionScore = Math.round(retentionScore * penaltyFactor)
```

| responseTimeMs | extra time | penalty steps | penalty |
|---|---|---|---|
| ≤ 15 s | — | 0 | none |
| 25 s | 10 s | 1 | −10% |
| 35 s | 20 s | 2 | −20% |
| 55 s | 40 s | 4 | −40% |

---

### Step 3: Enforce minimum

```
retentionScore = Math.max(MIN_RETENTION_DAYS, retentionScore)
```

---

### Step 4: Compute nextReviewAt

A ±20% uniform random variation is applied to avoid scheduling clusters:

```
variation    = random uniform in [-NEXT_REVIEW_VARIATION, +NEXT_REVIEW_VARIATION]
daysUntilNext = retentionScore * (1 + variation)
nextReviewAt = today + daysUntilNext days
```

Example: `retentionScore = 10` → next review is between 8 and 12 days from today.

---

## Parameters

All tunable constants are defined in one place in `lib/srs.ts`.

| Constant | Value | Description |
|---|---|---|
| `COLD_START_MAX_DAYS` | `45` | Max retention days awarded for a perfect first-ever response. |
| `MIN_RETENTION_DAYS` | `1` | Floor for `retentionScore` after all adjustments. |
| `RESPONSE_TIME_THRESHOLD_MS` | `15000` | Response time above which the penalty kicks in. |
| `RESPONSE_TIME_PENALTY_STEP_MS` | `10000` | Milliseconds per penalty step beyond the threshold. |
| `RESPONSE_TIME_PENALTY_PER_STEP` | `0.10` | Fractional reduction per penalty step. |
| `NEXT_REVIEW_VARIATION` | `0.20` | ±fraction applied randomly to `nextReviewAt`. |

---

## Testing Script

`scripts/test-srs.ts` runs the algorithm against a set of predefined scenarios and prints the results. It must cover at minimum:

| Scenario | Description |
|---|---|
| Cold start — perfect | `responseScore=1.0`, no prior progress → `retentionScore=45` |
| Cold start — zero | `responseScore=0.0`, no prior progress → `retentionScore=1` (min) |
| Cold start — partial | `responseScore=0.7`, no prior progress → `retentionScore=32` |
| Update — forgotten | `responseScore=0.0`, prior `retentionScore=20` → `retentionScore=10` |
| Update — perfect | `responseScore=1.0`, prior `retentionScore=20` → `retentionScore=40` |
| Update — partial | `responseScore=0.5`, prior `retentionScore=20` → `retentionScore=25` |
| Time penalty — 25 s | `responseTimeMs=25000` → −10% applied |
| Time penalty — 55 s | `responseTimeMs=55000` → −40% applied |
| Minimum floor | All conditions that result in `retentionScore < 1` → clamped to `1` |

Run with:

```bash
npx ts-node scripts/test-srs.ts
```

---

## Future Refinements (not in scope for Phase 3)

- **Bootstrap from aggregate data**: use cross-user recall history to calibrate `COLD_START_MAX_DAYS` and the interpolation curve per word difficulty.
- **Per-student curve fitting**: refine the multiplier curve over time using the individual student's accumulated `ReviewEvent` history.
- **Daily history weighting**: incorporate `reviewCount`, `avgResponseScore`, and `avgResponseTimeMs` to reward improvement within a single session.
