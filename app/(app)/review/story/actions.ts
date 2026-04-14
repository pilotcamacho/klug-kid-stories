'use server';

import Anthropic from '@anthropic-ai/sdk';
import { languageName } from '@/app/lib/languages';
import { countBlanks } from '@/lib/storySession';
import type { KnownVocabWord } from '@/lib/storySession';

// --- Types ---

export interface UserProfile {
  age?: number;
  gender?: string;
  interests?: string;
}

export interface GenerateStoryInput {
  targetWords: Array<{
    wordMeaningId: string;
    lemma: string;
    meaning: string;
  }>;
  knownVocab: KnownVocabWord[];
  targetLanguage: string;   // ISO 639-1, e.g. "de"
  sourceLanguage: string;   // ISO 639-1, e.g. "en"
  userProfile?: UserProfile;
}

export interface GenerateStoryOutput {
  storyText: string;
  targetWordMeaningIds: string[];
  error: string | null;
}

// --- Prompt ---

const SYSTEM_PROMPT = `You are a language learning story generator. Your task is to write a short, engaging story (3–6 sentences) to help a student practise vocabulary.

Rules you must follow without exception:
1. Always write the story in the TARGET language — no exceptions, even if the ALLOWED VOCABULARY list is empty or very short. Use basic, high-frequency grammatical words (articles, prepositions, pronouns, common verbs like be/have/go) to fill the story around the blanks whenever the vocabulary list is limited.
2. Every content word you use (except the blank words) must come from the ALLOWED VOCABULARY list, or be a grammatical function word (articles, prepositions, conjunctions, auxiliary verbs, pronouns, numbers). Do not introduce other content vocabulary.
3. For each TARGET WORD, replace its occurrence in the story with a blank in EXACTLY this format: ___ [conjugated-form] (source-translation)
   - ___ is the blank marker (three underscores).
   - [conjugated-form] is the actual inflected/conjugated/declined form of the target word as it appears in that sentence (e.g. [läuft], [couraient], [corriendo]).
   - (source-translation) is the base/lemma form in the SOURCE language, exactly as provided in the TARGET WORDS list.
   - Example: ___ [runs] (to run)
4. Each target word must appear exactly once in the story as a blank.
5. Calibrate sentence complexity to the vocabulary level of the TARGET WORDS:
   - Basic, everyday words (e.g. cat, run, big) → short, simple sentences with straightforward syntax.
   - Intermediate or abstract words → moderate complexity; subordinate clauses are fine.
   - Advanced or nuanced words → richer sentences that exploit the word's full meaning.
6. Make the story imaginative, surprising, or fantastical — dragons, time travel, talking objects, absurd situations, unexpected twists. Unusual stories are more memorable than realistic ones. Lean into creativity.
7. Output only the story text. No headers, labels, commentary, or explanation.
8. The story should be coherent and the correct word for each blank should be reasonably inferable from context.
9. If a STUDENT PROFILE is provided, tailor the story accordingly:
   - The main character(s) should resemble the student (similar age, gender if known).
   - Choose a setting or theme from the student's listed interests when possible, blended with fantasy and imagination.
   - If no profile is provided, write an imaginative story suitable for a general adult learner.`;

function buildProfileSection(profile?: UserProfile): string {
  if (!profile || (!profile.age && !profile.gender && !profile.interests)) return '';

  const lines: string[] = [];
  if (profile.age)       lines.push(`- Age: ${profile.age}`);
  if (profile.gender && profile.gender !== 'other') lines.push(`- Gender: ${profile.gender}`);
  if (profile.interests) lines.push(`- Interests: ${profile.interests}`);

  return `\nSTUDENT PROFILE:\n${lines.join('\n')}\n`;
}

function buildUserPrompt(input: GenerateStoryInput): string {
  const targetLang = languageName(input.targetLanguage);
  const sourceLang = languageName(input.sourceLanguage);

  const targetWordLines = input.targetWords
    .map((w) => `- ${w.lemma} (${w.meaning})`)
    .join('\n');

  // Cap at 80 words; they are pre-sorted by retention score descending by buildKnownVocab()
  const vocabList = input.knownVocab
    .slice(0, 80)
    .map((w) => w.lemma)
    .join(', ');

  const profileSection = buildProfileSection(input.userProfile);

  return `TARGET LANGUAGE: ${targetLang}
SOURCE LANGUAGE: ${sourceLang}
${profileSection}
TARGET WORDS (these become blanks in the story):
${targetWordLines}

ALLOWED VOCABULARY (use only these words for non-blank content, plus grammatical function words):
${vocabList || '(none yet)'}

Write the story now.`;
}

// --- Server Action ---

/**
 * Calls the Claude API to generate a story for a group of target words.
 * Never throws — returns { error } on any failure so the caller can fall back gracefully.
 */
export async function generateStory(input: GenerateStoryInput): Promise<GenerateStoryOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      storyText: '',
      targetWordMeaningIds: [],
      error: 'Story generation is not configured (missing API key).',
    };
  }

  try {
    // Instantiate inside the function body — never at module scope — so the key
    // is only read server-side and never bundled into client code.
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    const storyText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    // Validate that the response contains exactly the expected number of blanks.
    const expectedBlanks = input.targetWords.length;
    if (countBlanks(storyText) !== expectedBlanks) {
      return {
        storyText: '',
        targetWordMeaningIds: [],
        error: `Story generation produced an unexpected number of blanks (expected ${expectedBlanks}). Falling back to word-by-word mode.`,
      };
    }

    return {
      storyText,
      targetWordMeaningIds: input.targetWords.map((w) => w.wordMeaningId),
      error: null,
    };
  } catch (err) {
    return {
      storyText: '',
      targetWordMeaningIds: [],
      error: err instanceof Error ? err.message : 'Story generation failed.',
    };
  }
}
