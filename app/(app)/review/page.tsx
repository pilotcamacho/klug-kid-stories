'use client';

import { useEffect, useRef, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { buildSession, type BuildSessionOutput, type SessionItem } from '@/lib/session';
import { submitAnswer, type SubmitAnswerOutput } from '@/lib/progressActions';
import Link from 'next/link';
import SessionHeader from './components/SessionHeader';
import ReviewCard from './components/ReviewCard';
import EmptySession from './components/EmptySession';
import SessionSummary from './components/SessionSummary';

const client = generateClient<Schema>();

const DEFAULT_MAX_NEW   = 10;
const DEFAULT_MAX_REVIEWS = 100;

// ── Today's local-timezone boundaries ────────────────────────────────────────

function getTodayBounds(): { todayStartMs: number; todayEndMs: number; todayStartISO: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    todayStartMs:  start.getTime(),
    todayEndMs:    end.getTime(),
    todayStartISO: start.toISOString(),
  };
}

// ── Page state ────────────────────────────────────────────────────────────────

type PagePhase = 'loading' | 'no_settings' | 'empty' | 'active' | 'complete' | 'error';

interface CardState {
  input: string;
  submitting: boolean;
  submitted: boolean;
  result: SubmitAnswerOutput | null;
  submitError: string | null;
  questionStartedAt: number;
}

function freshCard(): CardState {
  return {
    input: '',
    submitting: false,
    submitted: false,
    result: null,
    submitError: null,
    questionStartedAt: Date.now(),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [phase, setPhase]           = useState<PagePhase>('loading');
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [session, setSession]       = useState<BuildSessionOutput | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [newIntroduced, setNewIntroduced] = useState(0);
  const [card, setCard]             = useState<CardState>(freshCard);
  const todayEndMsRef               = useRef<number>(0);

  // ── Load session on mount ───────────────────────────────────────────────────

  useEffect(() => {
    loadSession();
  }, []);

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
          client.models.ReviewEvent.list({
            filter: { createdAt: { ge: todayStartISO } },
          }),
          client.models.WordMeaning.list(),
        ]);

      if (settingsResult.errors?.length)    throw new Error(settingsResult.errors[0].message);
      if (progressResult.errors?.length)    throw new Error(progressResult.errors[0].message);
      if (reviewEventsResult.errors?.length) throw new Error(reviewEventsResult.errors[0].message);
      if (wordMeaningsResult.errors?.length) throw new Error(wordMeaningsResult.errors[0].message);

      const settings = settingsResult.data[0];

      // Guard: require a configured target language before starting a session.
      if (!settings?.targetLanguage) {
        setPhase('no_settings');
        return;
      }

      const targetLanguage = settings.targetLanguage;

      // Filter vocabulary to the user's configured target language only.
      const filteredWords = wordMeaningsResult.data.filter(
        (w) => w.targetLanguage === targetLanguage,
      );

      // Count today's review events only for words in the target language,
      // so switching languages mid-day doesn't consume the other language's quota.
      const filteredWordIds = new Set(filteredWords.map((w) => w.id));
      const reviewsCompletedToday = reviewEventsResult.data.filter((e) =>
        filteredWordIds.has(e.wordMeaningId),
      ).length;

      const result = buildSession({
        allWordMeanings: filteredWords.map((w) => ({
          id: w.id,
          lemma: w.lemma,
          meaning: w.meaning,
          targetLanguage: w.targetLanguage,
          sourceLanguage: w.sourceLanguage,
          exampleSentence: w.exampleSentence ?? null,
          frequencyRank: w.frequencyRank ?? null,
          sourceType: w.sourceType ?? null,
          createdAt: w.createdAt ?? null,
        })),
        allProgress: progressResult.data.map((p) => ({
          id: p.id,
          wordMeaningId: p.wordMeaningId,
          retentionScore: p.retentionScore ?? null,
          nextReviewAt: p.nextReviewAt,
          lastReviewedAt: p.lastReviewedAt ?? null,
          reviewCount: p.reviewCount ?? null,
          correctCount: p.correctCount ?? null,
          introducedAt: p.introducedAt,
          createdAt: p.createdAt ?? null,
        })),
        reviewsCompletedToday,
        maxNewWordsPerDay:  settings.maxNewWordsPerDay  ?? DEFAULT_MAX_NEW,
        maxReviewsPerDay:   settings.maxReviewsPerDay   ?? DEFAULT_MAX_REVIEWS,
        todayStartMs,
        todayEndMs,
        nowMs: Date.now(),
      });

      setSession(result);
      setCurrentIndex(0);
      setCorrectCount(0);
      setNewIntroduced(0);
      setCard(freshCard());

      setPhase(result.items.length === 0 ? 'empty' : 'active');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load session.');
      setPhase('error');
    }
  }

  // ── Answer submission ───────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!session || card.submitting || card.submitted) return;
    const item: SessionItem = session.items[currentIndex];
    if (card.input.trim().length === 0) return;

    setCard((c) => ({ ...c, submitting: true, submitError: null }));

    try {
      const result = await submitAnswer({
        client,
        wordMeaningId: item.wordMeaningId,
        expectedAnswer: item.lemma,
        studentResponse: card.input.trim(),
        questionStartedAt: card.questionStartedAt,
        existingProgress: item.existingProgress,
        storyContext: '',
      });

      setCard((c) => ({ ...c, submitting: false, submitted: true, result }));
      if (result.wasCorrect) setCorrectCount((n) => n + 1);
      if (item.wordType === 'new') setNewIntroduced((n) => n + 1);
    } catch (err) {
      setCard((c) => ({
        ...c,
        submitting: false,
        submitError: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      }));
    }
  }

  // ── Advance to next card ────────────────────────────────────────────────────

  function handleNext() {
    if (!session) return;

    // Midnight recheck: if we've crossed into a new day, reload the page so
    // daily limits are recalculated for the new calendar day.
    if (Date.now() > todayEndMsRef.current) {
      window.location.reload();
      return;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= session.items.length) {
      setPhase('complete');
    } else {
      setCurrentIndex(nextIndex);
      setCard(freshCard());
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Review</h1>
        <p className="text-sm text-gray-400">Loading your session…</p>
      </div>
    );
  }

  if (phase === 'no_settings') {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Review</h1>
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">No language configured.</p>
          <p className="text-sm text-gray-500 mb-6">
            Set your target language in Settings before starting a review session.
          </p>
          <a
            href="/settings"
            className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Review</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-sm text-red-700 mb-3">{loadError}</p>
          <button
            onClick={loadSession}
            className="text-sm text-red-600 hover:text-red-800 font-medium underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'empty' && session) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Review</h1>
        <EmptySession reason={session.emptyReason ?? 'nothing_due'} />
      </div>
    );
  }

  if (phase === 'complete' && session) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Review</h1>
        <SessionSummary
          totalAnswered={session.items.length}
          correctCount={correctCount}
          newWordsIntroduced={newIntroduced}
        />
      </div>
    );
  }

  if (phase === 'active' && session) {
    const item = session.items[currentIndex];
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Review</h1>
          <Link
            href="/review/story"
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            ← Story mode
          </Link>
        </div>
        <div className="max-w-xl">
          <SessionHeader
            current={currentIndex + 1}
            total={session.items.length}
            reviewCount={session.reviewCount}
            newCount={session.newCount}
          />
          <ReviewCard
            item={item}
            input={card.input}
            submitted={card.submitted}
            result={card.result}
            submitting={card.submitting}
            submitError={card.submitError}
            onInputChange={(v) => setCard((c) => ({ ...c, input: v }))}
            onSubmit={handleSubmit}
            onNext={handleNext}
          />
        </div>
      </div>
    );
  }

  return null;
}
