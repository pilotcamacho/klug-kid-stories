/**
 * Test script for Phase 3 services: SRS algorithm and Answer Evaluation.
 * Run with: npm run test:srs
 *
 * No test framework needed — plain assertions with clear output.
 */

import { evaluateAnswer } from "../lib/similarity";
import { computeReview } from "../lib/srs";

// --- Helpers ---

let passed = 0;
let failed = 0;

function check(label: string, actual: number, expected: number, tolerance = 0.001): void {
  const ok = Math.abs(actual - expected) <= tolerance;
  const status = ok ? "PASS" : "FAIL";
  const mark   = ok ? "✓" : "✗";
  if (ok) {
    passed++;
    console.log(`  ${mark} ${label}`);
  } else {
    failed++;
    console.log(`  ${mark} ${label}`);
    console.log(`      expected: ${expected} (±${tolerance})`);
    console.log(`      actual:   ${actual}`);
  }
}

function checkRange(label: string, actual: number, min: number, max: number): void {
  const ok = actual >= min && actual <= max;
  const mark = ok ? "✓" : "✗";
  if (ok) {
    passed++;
    console.log(`  ${mark} ${label}`);
  } else {
    failed++;
    console.log(`  ${mark} ${label}`);
    console.log(`      expected: [${min}, ${max}]`);
    console.log(`      actual:   ${actual}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
}

// ─────────────────────────────────────────────
// Answer Evaluation Service (lib/similarity.ts)
// ─────────────────────────────────────────────

section("Answer Evaluation Service");

check("exact match",                 evaluateAnswer("house",  "house"),  1.00);
check("case insensitive",            evaluateAnswer("House",  "house"),  1.00);
check("leading/trailing whitespace", evaluateAnswer("  house  ", "house"), 1.00);
check("one substitution (hause→house)", evaluateAnswer("hause", "house"), 0.80);
check("canonical example (sheep→cheap)", evaluateAnswer("sheep", "cheap"), 0.60);
check("completely wrong (cat→dog)",  evaluateAnswer("cat",    "dog"),    0.00);
check("empty student response",      evaluateAnswer("",       "house"),  0.00);
check("prefix match (run→running)",  evaluateAnswer("run",    "running"), 1 - 4/7, 0.01);
check("both empty → perfect",        evaluateAnswer("",       ""),       1.00);

// ─────────────────────────────────────────────
// SRS Algorithm (lib/srs.ts)
// ─────────────────────────────────────────────

section("SRS Algorithm — Cold Start (no prior progress)");

{
  const r = computeReview({ initialResponse: { responseScore: 1.0, responseTimeMs: 1000 } });
  check("perfect score → retentionScore=45", r.retentionScore, 45);
}
{
  const r = computeReview({ initialResponse: { responseScore: 0.0, responseTimeMs: 1000 } });
  check("zero score → retentionScore=1 (min floor)", r.retentionScore, 1);
}
{
  const r = computeReview({ initialResponse: { responseScore: 0.7, responseTimeMs: 1000 } });
  check("score=0.7 → retentionScore=31", r.retentionScore, 31); // 0.7*45=31.4999... in JS → rounds to 31
}
{
  const r = computeReview({ initialResponse: { responseScore: 0.5, responseTimeMs: 1000 } });
  check("score=0.5 → retentionScore=23", r.retentionScore, 23);
}

section("SRS Algorithm — Update (with prior progress)");

const prior = { retentionScore: 20, lastReviewedAt: new Date() };

{
  const r = computeReview({ initialResponse: { responseScore: 0.0, responseTimeMs: 1000 }, previousProgress: prior });
  check("forgotten (score=0) → retentionScore=10", r.retentionScore, 10);
}
{
  const r = computeReview({ initialResponse: { responseScore: 1.0, responseTimeMs: 1000 }, previousProgress: prior });
  check("perfect (score=1) → retentionScore=40", r.retentionScore, 40);
}
{
  const r = computeReview({ initialResponse: { responseScore: 0.5, responseTimeMs: 1000 }, previousProgress: prior });
  check("partial (score=0.5) → retentionScore=25", r.retentionScore, 25);
}

section("SRS Algorithm — Response Time Penalty");

{
  // 25 s → 1 penalty step → −10% → Math.round(40 * 0.9) = 36
  const r = computeReview({ initialResponse: { responseScore: 1.0, responseTimeMs: 25_000 }, previousProgress: prior });
  check("25 s (1 step, −10%) → retentionScore=36", r.retentionScore, 36);
}
{
  // 35 s → 2 penalty steps → −20% → Math.round(40 * 0.8) = 32
  const r = computeReview({ initialResponse: { responseScore: 1.0, responseTimeMs: 35_000 }, previousProgress: prior });
  check("35 s (2 steps, −20%) → retentionScore=32", r.retentionScore, 32);
}
{
  // 55 s → 4 penalty steps → −40% → Math.round(40 * 0.6) = 24
  const r = computeReview({ initialResponse: { responseScore: 1.0, responseTimeMs: 55_000 }, previousProgress: prior });
  check("55 s (4 steps, −40%) → retentionScore=24", r.retentionScore, 24);
}
{
  // Penalty cannot drive below 1
  const r = computeReview({ initialResponse: { responseScore: 0.0, responseTimeMs: 999_000 }, previousProgress: prior });
  check("extreme penalty → retentionScore=1 (min floor)", r.retentionScore, 1);
}

section("SRS Algorithm — nextReviewAt variation");

{
  // retentionScore=45 (cold start perfect), variation ±20%  → [36, 54] days from now
  const r = computeReview({ initialResponse: { responseScore: 1.0, responseTimeMs: 1000 } });
  const daysUntilNext = (r.nextReviewAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  checkRange("perfect cold start: nextReviewAt in [36, 54] days", daysUntilNext, 36, 54);
}
{
  // retentionScore=10 (prior=20, score=0.5 → 25... but use prior=10 for simpler check)
  const prior10 = { retentionScore: 10, lastReviewedAt: new Date() };
  const r = computeReview({ initialResponse: { responseScore: 1.0, responseTimeMs: 1000 }, previousProgress: prior10 });
  const daysUntilNext = (r.nextReviewAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  checkRange("retentionScore=20: nextReviewAt in [16, 24] days", daysUntilNext, 16, 24);
}

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ""}`);

if (failed > 0) process.exit(1);
