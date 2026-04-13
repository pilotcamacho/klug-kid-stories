# Answer Evaluation Service

## Overview

The answer evaluation service converts a student's typed response and the expected answer into a `responseScore` in [0.0, 1.0]. It is the single point of contact between the review UI and any answer-scoring logic.

The rest of the app never implements scoring logic directly — it only calls `evaluateAnswer`. This makes it safe to swap the underlying algorithm (e.g. from string similarity to AI-powered evaluation in Phase 7) without touching any other code.

**Location:** `lib/similarity.ts`

---

## Interface

```typescript
/**
 * Compares a student's response against the expected answer.
 * Returns a score in [0.0, 1.0] where 1.0 is a perfect match.
 */
function evaluateAnswer(studentResponse: string, expectedAnswer: string): number
```

This is the only export from `lib/similarity.ts`. All algorithm details are internal.

---

## Algorithm — Normalized Levenshtein Similarity

The current implementation uses **normalized Levenshtein distance**:

### Step 1: Normalize both strings

```
normalize(s) = s.trim().toLowerCase()
```

### Step 2: Compute Levenshtein distance

The minimum number of single-character edits (insertions, deletions, substitutions) required to transform one string into the other.

### Step 3: Compute similarity score

```
score = 1 - (levenshteinDistance / Math.max(a.length, b.length))
score = Math.max(0.0, score)   // clamp — cannot go below 0
```

### Examples

| Student response | Expected answer | Distance | Max length | Score |
|---|---|---|---|---|
| `sheep` | `cheap` | 2 | 5 | **0.60** |
| `house` | `house` | 0 | 5 | **1.00** |
| `hause` | `house` | 1 | 5 | **0.80** |
| `Haus` | `haus` | 0 (normalized) | 4 | **1.00** |
| `cat` | `dog` | 3 | 3 | **0.00** |
| `run` | `running` | 4 | 7 | **0.43** |

---

## Parameters

| Constant | Value | Description |
|---|---|---|
| `SIMILARITY_FLOOR` | `0.0` | Minimum score — cannot be negative. |

There are intentionally few parameters. The algorithm's behavior is determined by the Levenshtein implementation itself.

---

## Design Notes

- **Accented characters** are treated as distinct from their unaccented equivalents (`é` ≠ `e`). This is intentional: in language learning, spelling precision matters.
- **Case** is ignored (both strings are lowercased before comparison).
- **Leading/trailing whitespace** is stripped before comparison.
- **Multiple internal spaces** are not collapsed — this is left to a future refinement if needed.

---

## Testing Script

`scripts/test-srs.ts` includes a section for the answer evaluation service. Scenarios that must be covered:

| Scenario | Student | Expected | Score |
|---|---|---|---|
| Exact match | `house` | `house` | `1.00` |
| Case difference | `House` | `house` | `1.00` |
| One substitution | `hause` | `house` | `0.80` |
| Classic example | `sheep` | `cheap` | `0.60` |
| Completely wrong | `cat` | `dog` | `0.00` |
| Empty student response | `` | `house` | `0.00` |
| Prefix match | `run` | `running` | `0.43` |

---

## Future Refinements (not in scope for Phase 3)

- **AI-powered evaluation** (Phase 7): replace the Levenshtein implementation with a Claude API call that understands inflected forms (conjugations, plural, case) and controlled typo tolerance. The interface (`evaluateAnswer`) stays the same — only the internals change.
- **Language-aware normalization**: strip diacritics optionally per language pair if the target language treats them as non-essential.
