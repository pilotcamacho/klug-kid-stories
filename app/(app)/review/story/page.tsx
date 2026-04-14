'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { buildSession, type SessionItem } from '@/lib/session';
import { submitAnswer, type SubmitAnswerOutput } from '@/lib/progressActions';
import {
  buildKnownVocab,
  groupSessionItems,
  parseStoryBlanks,
  type Segment,
  type StoryGroup,
} from '@/lib/storySession';
import { generateStory, type UserProfile } from './actions';
import SessionHeader from '../components/SessionHeader';
import SessionSummary from '../components/SessionSummary';
import EmptySession from '../components/EmptySession';
import StoryGenerating from './components/StoryGenerating';
import StoryDisplay from './components/StoryDisplay';

const client = generateClient<Schema>();

const DEFAULT_MAX_NEW      = 10;
const DEFAULT_MAX_REVIEWS  = 100;

// ── Today's local-timezone boundaries ────────────────────────────────────────

function getTodayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    todayStartMs:  start.getTime(),
    todayEndMs:    end.getTime(),
    todayStartISO: start.toISOString(),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PagePhase =
  | 'loading'
  | 'generating'
  | 'active'
  | 'fallback'
  | 'complete'
  | 'empty'
  | 'error'
  | 'no_settings';

interface BlankAnswer {
  value: string;
  result: SubmitAnswerOutput | null;
  submitted: boolean;
  expectedAnswer: string;
  // Carried from the matched SessionItem so submission uses the right word
  // regardless of the order Claude placed the blanks in the story.
  wordMeaningId: string;
  existingProgress: SessionItem['existingProgress'];
  wordType: SessionItem['wordType'];
  /** Conjugated/declined form from the story blank; evaluated alongside the lemma. */
  conjugatedForm: string;
}

interface ActiveStory {
  storyText: string;
  storyId: string | null;
  segments: Segment[];
  group: StoryGroup;
  answers: BlankAnswer[];
  currentBlankIndex: number;
  input: string;
  submitting: boolean;
  submitError: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StoryReviewPage() {
  const [phase, setPhase]               = useState<PagePhase>('loading');
  const [loadError, setLoadError]       = useState<string | null>(null);

  // Session data — kept in refs so they are stable across re-renders during story transitions
  const storyGroupsRef  = useRef<StoryGroup[]>([]);
  const allProgressRef  = useRef<Parameters<typeof buildKnownVocab>[0]>([]);
  const allWordMeanRef  = useRef<Parameters<typeof buildKnownVocab>[1]>([]);
  const sessionItemsRef = useRef<ReturnType<typeof buildSession>['items']>([]);
  const sessionRef      = useRef<ReturnType<typeof buildSession> | null>(null);
  const settingsRef     = useRef<{ targetLanguage: string; sourceLanguage: string; userProfile: UserProfile } | null>(null);
  const todayEndMsRef   = useRef<number>(0);

  // Story state
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [story, setStory]                         = useState<ActiveStory | null>(null);

  // Summary counters
  const [correctCount, setCorrectCount]     = useState(0);
  const [newIntroduced, setNewIntroduced]   = useState(0);

  // Fallback (Phase 4) state
  const [fallbackIndex, setFallbackIndex]   = useState(0);
  const [fallbackCard, setFallbackCard]     = useState(freshFallbackCard);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  function freshFallbackCard() {
    return { input: '', submitting: false, submitted: false, result: null as SubmitAnswerOutput | null, submitError: null as string | null, questionStartedAt: Date.now() };
  }

  // ── Load session on mount ───────────────────────────────────────────────────

  useEffect(() => { loadSession(); }, []);

  async function loadSession() {
    setPhase('loading');
    setLoadError(null);

    try {
      const { todayStartMs, todayEndMs, todayStartISO } = getTodayBounds();
      todayEndMsRef.current = todayEndMs;

      const [settingsResult, progressResult, reviewEventsResult, wordMeaningsResult] =
        await Promise.all([
          client.models.UserSettings.list(),
          client.models.UserWordProgress.list(),
          client.models.ReviewEvent.list({ filter: { createdAt: { ge: todayStartISO } } }),
          client.models.WordMeaning.list(),
        ]);

      if (settingsResult.errors?.length)     throw new Error(settingsResult.errors[0].message);
      if (progressResult.errors?.length)     throw new Error(progressResult.errors[0].message);
      if (reviewEventsResult.errors?.length) throw new Error(reviewEventsResult.errors[0].message);
      if (wordMeaningsResult.errors?.length) throw new Error(wordMeaningsResult.errors[0].message);

      const settings = settingsResult.data[0];
      if (!settings?.targetLanguage) { setPhase('no_settings'); return; }

      const age = settings.profileDateOfBirth
        ? (() => {
            const dob = new Date(settings.profileDateOfBirth);
            const today = new Date();
            let years = today.getFullYear() - dob.getFullYear();
            const hadBirthday =
              today.getMonth() > dob.getMonth() ||
              (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
            if (!hadBirthday) years -= 1;
            return years > 0 ? years : undefined;
          })()
        : undefined;

      settingsRef.current = {
        targetLanguage: settings.targetLanguage,
        sourceLanguage: settings.sourceLanguage ?? 'en',
        userProfile: {
          age,
          gender: settings.profileGender ?? undefined,
          interests: settings.profileInterests ?? undefined,
        },
      };

      const filteredWords = wordMeaningsResult.data.filter(
        (w) => w.targetLanguage === settings.targetLanguage,
      );
      const filteredWordIds = new Set(filteredWords.map((w) => w.id));
      const reviewsCompletedToday = reviewEventsResult.data.filter(
        (e) => filteredWordIds.has(e.wordMeaningId),
      ).length;

      const allProgress = progressResult.data.map((p) => ({
        id: p.id,
        wordMeaningId: p.wordMeaningId,
        retentionScore: p.retentionScore ?? null,
        nextReviewAt: p.nextReviewAt,
        lastReviewedAt: p.lastReviewedAt ?? null,
        reviewCount: p.reviewCount ?? null,
        correctCount: p.correctCount ?? null,
        introducedAt: p.introducedAt,
        createdAt: p.createdAt ?? null,
      }));

      const allWordMeanings = filteredWords.map((w) => ({
        id: w.id,
        lemma: w.lemma,
        meaning: w.meaning,
        targetLanguage: w.targetLanguage,
        sourceLanguage: w.sourceLanguage,
        exampleSentence: w.exampleSentence ?? null,
        frequencyRank: w.frequencyRank ?? null,
        sourceType: w.sourceType ?? null,
        createdAt: w.createdAt ?? null,
      }));

      const session = buildSession({
        allWordMeanings,
        allProgress,
        reviewsCompletedToday,
        maxNewWordsPerDay: settings.maxNewWordsPerDay  ?? DEFAULT_MAX_NEW,
        maxReviewsPerDay:  settings.maxReviewsPerDay   ?? DEFAULT_MAX_REVIEWS,
        todayStartMs,
        todayEndMs,
        nowMs: Date.now(),
      });

      sessionRef.current    = session;
      sessionItemsRef.current = session.items;
      allProgressRef.current  = allProgress;
      allWordMeanRef.current  = allWordMeanings;

      if (session.items.length === 0) { setPhase('empty'); return; }

      const groups = groupSessionItems(session.items);
      storyGroupsRef.current = groups;

      setCurrentGroupIndex(0);
      setCorrectCount(0);
      setNewIntroduced(0);
      await startGroup(0, groups);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load session.');
      setPhase('error');
    }
  }

  // ── Generate story for a group ──────────────────────────────────────────────

  async function startGroup(groupIndex: number, groups?: StoryGroup[]) {
    const resolvedGroups = groups ?? storyGroupsRef.current;
    const group = resolvedGroups[groupIndex];
    if (!group) { setPhase('complete'); return; }

    // Midnight recheck
    if (Date.now() > todayEndMsRef.current) { window.location.reload(); return; }

    setPhase('generating');

    const sessionWordIds = new Set(group.items.map((i) => i.wordMeaningId));
    const knownVocab = buildKnownVocab(
      allProgressRef.current,
      allWordMeanRef.current,
      sessionWordIds,
    );

    const { targetLanguage, sourceLanguage, userProfile } = settingsRef.current!;

    const result = await generateStory({
      targetWords: group.items.map((item) => ({
        wordMeaningId: item.wordMeaningId,
        lemma: item.lemma,
        meaning: item.meaning,
      })),
      knownVocab,
      targetLanguage,
      sourceLanguage,
      userProfile,
    });

    console.log('[StoryReview] generateStory result:', result);

    if (result.error) {
      // Fall back to Phase 4 plain cards, preserving the reason for display
      setFallbackReason(result.error);
      setFallbackIndex(groupIndex * 5);   // approximate start index within session items
      setFallbackCard(freshFallbackCard());
      setPhase('fallback');
      return;
    }

    // Save story record client-side
    let storyId: string | null = null;
    try {
      const { data } = await client.models.Story.create({
        content: result.storyText,
        targetWordMeaningIds: result.targetWordMeaningIds,
        targetLanguage,
      });
      storyId = data?.id ?? null;
    } catch {
      // Non-fatal — storyContext still works without a saved id
    }

    const segments = parseStoryBlanks(result.storyText);

    // Match each blank to the correct SessionItem by comparing the hint
    // (source-language meaning from the story text) to item.meaning.
    // Claude may place target words in a different order than we provided them,
    // so positional mapping would assign the wrong expectedAnswer.
    const unusedItems = [...group.items];
    const blankSegments = segments.filter((s): s is Extract<typeof s, { type: 'blank' }> => s.type === 'blank');
    const answers: BlankAnswer[] = blankSegments.map((seg) => {
      const matchIdx = unusedItems.findIndex(
        (item) => item.meaning.toLowerCase().trim() === seg.hint.toLowerCase().trim(),
      );
      // Fall back to first unused item if hint matching fails (e.g. Claude paraphrased)
      const itemIdx = matchIdx !== -1 ? matchIdx : 0;
      const [item] = unusedItems.splice(itemIdx, 1);
      return {
        value: '',
        result: null,
        submitted: false,
        expectedAnswer: item.lemma,
        wordMeaningId: item.wordMeaningId,
        existingProgress: item.existingProgress,
        wordType: item.wordType,
        conjugatedForm: seg.conjugatedForm,
      };
    });

    setStory({
      storyText: result.storyText,
      storyId,
      segments,
      group,
      answers,
      currentBlankIndex: 0,
      input: '',
      submitting: false,
      submitError: null,
    });
    setPhase('active');
  }

  // ── Answer submission (story mode) ──────────────────────────────────────────

  async function handleStorySubmit() {
    if (!story || story.submitting) return;
    if (story.input.trim().length === 0) return;

    const answer = story.answers[story.currentBlankIndex];
    const questionStartedAt = Date.now() - 5000; // approximate; inline blanks don't track start time per-blank

    setStory((s) => s ? { ...s, submitting: true, submitError: null } : s);

    try {
      const result = await submitAnswer({
        client,
        wordMeaningId: answer.wordMeaningId,
        expectedAnswer: answer.expectedAnswer,
        studentResponse: story.input.trim(),
        questionStartedAt,
        existingProgress: answer.existingProgress,
        storyContext: story.storyText,
        acceptedConjugatedForm: answer.conjugatedForm,
      });

      if (result.wasCorrect) setCorrectCount((n) => n + 1);
      if (answer.wordType === 'new') setNewIntroduced((n) => n + 1);

      setStory((s) => {
        if (!s) return s;
        const newAnswers = s.answers.map((a, i) =>
          i === s.currentBlankIndex
            ? { ...a, value: s.input.trim(), result, submitted: true }
            : a
        );
        return { ...s, answers: newAnswers, submitting: false };
      });
    } catch (err) {
      setStory((s) => s
        ? { ...s, submitting: false, submitError: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }
        : s
      );
    }
  }

  function handleStoryNext() {
    if (!story) return;
    const nextBlank = story.currentBlankIndex + 1;

    if (nextBlank < story.group.items.length) {
      // Advance to next blank in the same story
      setStory((s) => s ? { ...s, currentBlankIndex: nextBlank, input: '', submitError: null } : s);
    } else {
      // All blanks answered — move to next group
      const nextGroup = currentGroupIndex + 1;
      setCurrentGroupIndex(nextGroup);
      if (nextGroup >= storyGroupsRef.current.length) {
        setPhase('complete');
      } else {
        startGroup(nextGroup);
      }
    }
  }

  // ── Fallback (Phase 4) submission ───────────────────────────────────────────

  async function handleFallbackSubmit() {
    const items = sessionItemsRef.current;
    const item = items[fallbackIndex];
    if (!item || fallbackCard.submitting || fallbackCard.submitted) return;
    if (fallbackCard.input.trim().length === 0) return;

    setFallbackCard((c) => ({ ...c, submitting: true, submitError: null }));

    try {
      const result = await submitAnswer({
        client,
        wordMeaningId: item.wordMeaningId,
        expectedAnswer: item.lemma,
        studentResponse: fallbackCard.input.trim(),
        questionStartedAt: fallbackCard.questionStartedAt,
        existingProgress: item.existingProgress,
        storyContext: '',
      });
      setFallbackCard((c) => ({ ...c, submitting: false, submitted: true, result }));
      if (result.wasCorrect) setCorrectCount((n) => n + 1);
      if (item.wordType === 'new') setNewIntroduced((n) => n + 1);
    } catch (err) {
      setFallbackCard((c) => ({
        ...c,
        submitting: false,
        submitError: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      }));
    }
  }

  function handleFallbackNext() {
    if (Date.now() > todayEndMsRef.current) { window.location.reload(); return; }
    const nextIndex = fallbackIndex + 1;
    if (nextIndex >= sessionItemsRef.current.length) {
      setPhase('complete');
    } else {
      setFallbackIndex(nextIndex);
      setFallbackCard(freshFallbackCard());
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const session = sessionRef.current;

  // Header props — computed from current group or fallback position
  function getHeaderProps() {
    const groups = storyGroupsRef.current;
    const items  = sessionItemsRef.current;
    if (phase === 'fallback') {
      return { current: fallbackIndex + 1, total: items.length, reviewCount: session?.reviewCount ?? 0, newCount: session?.newCount ?? 0 };
    }
    const group = groups[currentGroupIndex];
    if (!group) return { current: 1, total: 1, reviewCount: 0, newCount: 0 };
    // Show completed items across all groups so far
    const completedBefore = currentGroupIndex * 5;
    const currentInGroup  = story?.currentBlankIndex ?? 0;
    return {
      current: completedBefore + currentInGroup + 1,
      total: items.length,
      reviewCount: session?.reviewCount ?? 0,
      newCount: session?.newCount ?? 0,
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const pageTitle = (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-gray-900">Story Review</h1>
      <Link href="/review" className="text-sm text-gray-500 hover:text-gray-700">
        ← Word-by-word mode
      </Link>
    </div>
  );

  if (phase === 'loading') {
    return <div>{pageTitle}<p className="text-sm text-gray-400">Loading your session…</p></div>;
  }

  if (phase === 'no_settings') {
    return (
      <div>
        {pageTitle}
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">No language configured.</p>
          <p className="text-sm text-gray-500 mb-6">Set your target language in Settings before starting a review session.</p>
          <a href="/settings" className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors">Go to Settings</a>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div>
        {pageTitle}
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-sm text-red-700 mb-3">{loadError}</p>
          <button onClick={loadSession} className="text-sm text-red-600 hover:text-red-800 font-medium underline">Try again</button>
        </div>
      </div>
    );
  }

  if (phase === 'empty' && session) {
    return <div>{pageTitle}<EmptySession reason={session.emptyReason ?? 'nothing_due'} /></div>;
  }

  if (phase === 'complete' && session) {
    return (
      <div>
        {pageTitle}
        <SessionSummary
          totalAnswered={session.items.length}
          correctCount={correctCount}
          newWordsIntroduced={newIntroduced}
        />
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <div>
        {pageTitle}
        <div className="max-w-xl">
          <SessionHeader {...getHeaderProps()} />
          <StoryGenerating />
        </div>
      </div>
    );
  }

  if (phase === 'active' && story) {
    return (
      <div>
        {pageTitle}
        <div className="max-w-xl">
          <SessionHeader {...getHeaderProps()} />
          <StoryDisplay
            segments={story.segments}
            currentBlankIndex={story.currentBlankIndex}
            answers={story.answers}
            input={story.input}
            submitting={story.submitting}
            submitError={story.submitError}
            onInputChange={(v) => setStory((s) => s ? { ...s, input: v } : s)}
            onSubmit={handleStorySubmit}
            onNext={handleStoryNext}
          />
        </div>
      </div>
    );
  }

  if (phase === 'fallback' && session) {
    // Render Phase 4 plain cards for remaining items
    const items = sessionItemsRef.current;
    const item = items[fallbackIndex];
    if (!item) { setPhase('complete'); return null; }

    // Import ReviewCard inline to avoid circular deps
    const { default: ReviewCard } = require('../components/ReviewCard');
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Review</h1>
          <Link href="/review" className="text-sm text-gray-500 hover:text-gray-700">
            ← Word-by-word mode
          </Link>
        </div>
        {fallbackReason && (
          <div className="max-w-xl mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex gap-3 items-start">
            <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Story generation failed — showing word-by-word review</p>
              <p className="text-xs text-amber-700 mt-0.5">{fallbackReason}</p>
            </div>
            <Link
              href="/review"
              className="shrink-0 text-xs font-medium text-amber-800 underline hover:text-amber-900 mt-0.5"
            >
              Switch to standard review →
            </Link>
          </div>
        )}
        <div className="max-w-xl">
          <SessionHeader {...getHeaderProps()} />
          <ReviewCard
            item={item}
            input={fallbackCard.input}
            submitted={fallbackCard.submitted}
            result={fallbackCard.result}
            submitting={fallbackCard.submitting}
            submitError={fallbackCard.submitError}
            onInputChange={(v: string) => setFallbackCard((c) => ({ ...c, input: v }))}
            onSubmit={handleFallbackSubmit}
            onNext={handleFallbackNext}
          />
        </div>
      </div>
    );
  }

  return null;
}
