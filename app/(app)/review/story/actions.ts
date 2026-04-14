'use server';

import Anthropic from '@anthropic-ai/sdk';
import { languageName } from '@/app/lib/languages';
import { countBlanks } from '@/lib/storySession';
import type { KnownVocabWord } from '@/lib/storySession';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  age?: number;
  gender?: string;
  interests?: string;
}

export interface GenerateTopicsInput {
  userProfile: UserProfile;
}

export interface GenerateTopicsOutput {
  topics: string[];
  error: string | null;
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
  /** One topic drawn at random from the user's ProfileTopics list. */
  storyTopic?: string;
  /** Soft hints only — topic drives the theme; profile drives complexity + character. */
  userProfile?: UserProfile;
}

export interface GenerateStoryOutput {
  storyText: string;
  targetWordMeaningIds: string[];
  error: string | null;
}

// ─── Topic generation ─────────────────────────────────────────────────────────

const TOPICS_SYSTEM_PROMPT = `You generate a list of engaging story topics tailored to a person's profile.
Output exactly 20 topics, one per line, with no numbering, bullets, or extra punctuation.
Each topic is a short imaginative phrase (4–8 words) that could serve as a story premise.
Mix a wide variety: everyday adventures, fantasy, science fiction, nature, sports, food, travel, mysteries, humour, and other creative scenarios.
Do not repeat themes. Make each topic distinct and vivid.`;

function buildTopicsUserPrompt(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.age)                              parts.push(`age ${profile.age}`);
  if (profile.gender && profile.gender !== 'other') parts.push(profile.gender);
  if (profile.interests)                        parts.push(`interests: ${profile.interests}`);

  const profileDesc = parts.length > 0
    ? parts.join(', ')
    : 'a general adult learner with broad interests';

  return `Generate 20 diverse and imaginative story topics for a person with this profile: ${profileDesc}.
Make them varied — include magical, adventurous, humorous, and everyday scenarios.
Output exactly 20 topics, one per line, no numbering.`;
}

/**
 * Asks Claude to generate 20 story topics suited to the student's profile.
 * The topics are stored in DynamoDB (ProfileTopics model) by the caller and
 * reused across sessions; this function is only called when the profile changes.
 * Never throws — returns { error } on any failure.
 */
export async function generateProfileTopics(input: GenerateTopicsInput): Promise<GenerateTopicsOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { topics: [], error: 'Missing API key.' };
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',   // fast + cheap for a list task
      max_tokens: 400,
      system: TOPICS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildTopicsUserPrompt(input.userProfile) }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    const topics = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 20);

    if (topics.length === 0) {
      return { topics: [], error: 'Topic generation returned no content.' };
    }

    return { topics, error: null };
  } catch (err) {
    return { topics: [], error: err instanceof Error ? err.message : 'Topic generation failed.' };
  }
}

// ─── Story generation ─────────────────────────────────────────────────────────

const STORY_STYLES = [
  'comic and absurd',
  'suspenseful and mysterious',
  'heartwarming and cozy',
  'epic and heroic',
  'fast-paced and action-packed',
  'whimsical and dreamlike',
  'dark and eerie',
  'satirical and witty',
  'poetic and lyrical',
  'philosophical and thought-provoking',
  'slapstick and chaotic',
  'tender and melancholic',
];

const STORY_SYSTEM_PROMPT = `You are a language learning story generator. Your task is to write a short, engaging story (3–6 sentences) to help a student practise vocabulary.

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
9. If a STORY TOPIC is provided, use it as the primary theme or setting — interpret it freely and imaginatively; it need not be literal.
10. A NARRATIVE STYLE will be provided. Let it colour the tone, mood, and voice of the story — do not ignore it.
11. If a STUDENT PROFILE is provided, use it as soft guidance only:
    - Age → calibrate sentence complexity to match the student's level (simpler for younger, richer for older).
    - Gender → the main character may reflect the student's gender, but this is optional.
    Do not force the profile into the narrative; let the topic drive the story.`;

function buildStoryUserPrompt(input: GenerateStoryInput): string {
  const targetLang = languageName(input.targetLanguage);
  const sourceLang = languageName(input.sourceLanguage);

  const targetWordLines = input.targetWords
    .map((w) => `- ${w.lemma} (${w.meaning})`)
    .join('\n');

  // Cap at 80 words; pre-sorted by retention score descending by buildKnownVocab()
  const vocabList = input.knownVocab
    .slice(0, 80)
    .map((w) => w.lemma)
    .join(', ');

  const topicLine = input.storyTopic
    ? `\nSTORY TOPIC: ${input.storyTopic}\n`
    : '';

  const style = STORY_STYLES[Math.floor(Math.random() * STORY_STYLES.length)];
  const styleLine = `\nNARRATIVE STYLE: ${style}\n`;

  const profileLines: string[] = [];
  if (input.userProfile?.age)                                    profileLines.push(`- Age: ${input.userProfile.age}`);
  if (input.userProfile?.gender && input.userProfile.gender !== 'other') profileLines.push(`- Gender: ${input.userProfile.gender}`);
  const profileSection = profileLines.length > 0
    ? `\nSTUDENT PROFILE (soft hints only):\n${profileLines.join('\n')}\n`
    : '';

  return `TARGET LANGUAGE: ${targetLang}
SOURCE LANGUAGE: ${sourceLang}
${topicLine}${styleLine}${profileSection}
TARGET WORDS (these become blanks in the story):
${targetWordLines}

ALLOWED VOCABULARY (use only these words for non-blank content, plus grammatical function words):
${vocabList || '(none yet)'}

Write the story now.`;
}

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
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 600,
      temperature: 1,   // max creativity — each call should feel genuinely different
      system: STORY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildStoryUserPrompt(input) }],
    });

    const storyText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('')
      .trim();

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
