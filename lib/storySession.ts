// Story Session Utilities
// Pure functions — no side effects, no I/O, no Amplify imports.
// Used by the story page to prepare data for Claude and parse the response.

import type { SessionItem, UserWordProgressRecord, WordMeaningRecord } from './session';

// --- Thresholds ---

export const KNOWN_VOCAB_THRESHOLD = {
  minReviewCount: 2,
  minRetentionScore: 3,
};

export const MAX_BLANKS_PER_STORY = 5;

// --- Types ---

export interface StoryGroup {
  items: SessionItem[];
  groupIndex: number;   // 0-based
  totalGroups: number;
}

export interface KnownVocabWord {
  lemma: string;
  meaning: string;      // source-language definition (shown in parentheses in the story)
}

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'blank'; index: number; hint: string; conjugatedForm: string };

// --- Functions ---

/**
 * Splits session items into groups of up to MAX_BLANKS_PER_STORY.
 * Each group corresponds to one generated story.
 */
export function groupSessionItems(items: SessionItem[]): StoryGroup[] {
  const groups: StoryGroup[] = [];
  for (let i = 0; i < items.length; i += MAX_BLANKS_PER_STORY) {
    groups.push({
      items: items.slice(i, i + MAX_BLANKS_PER_STORY),
      groupIndex: groups.length,
      totalGroups: Math.ceil(items.length / MAX_BLANKS_PER_STORY),
    });
  }
  // Fix totalGroups after we know the final count
  const total = groups.length;
  for (const g of groups) g.totalGroups = total;
  return groups;
}

/**
 * Builds the pool of context words the story may use (not the target/blank words).
 * Filters by KNOWN_VOCAB_THRESHOLD and excludes words that are already in the session
 * (those become blanks, not context).
 *
 * Returns words sorted by retentionScore descending so the most-retained words
 * appear first in the prompt (most reliable context).
 */
export function buildKnownVocab(
  allProgress: UserWordProgressRecord[],
  allWordMeanings: WordMeaningRecord[],
  sessionWordMeaningIds: Set<string>,
): KnownVocabWord[] {
  const wordMap = new Map<string, WordMeaningRecord>();
  for (const wm of allWordMeanings) wordMap.set(wm.id, wm);

  return allProgress
    .filter((p) => {
      if (sessionWordMeaningIds.has(p.wordMeaningId)) return false;
      if ((p.reviewCount ?? 0) < KNOWN_VOCAB_THRESHOLD.minReviewCount) return false;
      if ((p.retentionScore ?? 0) < KNOWN_VOCAB_THRESHOLD.minRetentionScore) return false;
      return wordMap.has(p.wordMeaningId);
    })
    .sort((a, b) => (b.retentionScore ?? 0) - (a.retentionScore ?? 0))
    .map((p) => {
      const wm = wordMap.get(p.wordMeaningId)!;
      return { lemma: wm.lemma, meaning: wm.meaning };
    });
}

/**
 * Parses a generated story text into an array of Segments.
 *
 * The expected blank format is: ___ [conjugated-form] (hint)
 * where conjugated-form is the inflected target-language word and hint is the source-language translation.
 *
 * Example input:  "Maria ___ [runs] (to run) every morning."
 * Example output: [
 *   { type: 'text', content: 'Maria ' },
 *   { type: 'blank', index: 0, conjugatedForm: 'runs', hint: 'to run' },
 *   { type: 'text', content: ' every morning.' },
 * ]
 */
export function parseStoryBlanks(storyText: string): Segment[] {
  const segments: Segment[] = [];
  const BLANK_PATTERN = /___\s*\[([^\]]+)\]\s*\(([^)]+)\)/g;
  let lastIndex = 0;
  let blankIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = BLANK_PATTERN.exec(storyText)) !== null) {
    // Text before this blank
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: storyText.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'blank', index: blankIndex, conjugatedForm: match[1].trim(), hint: match[2].trim() });
    blankIndex++;
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after the last blank
  if (lastIndex < storyText.length) {
    segments.push({ type: 'text', content: storyText.slice(lastIndex) });
  }

  return segments;
}

/**
 * Counts how many ___ (...) blanks appear in a story text.
 * Used to validate the Claude response.
 */
export function countBlanks(storyText: string): number {
  return (storyText.match(/___\s*\[[^\]]+\]\s*\([^)]+\)/g) ?? []).length;
}
