'use client';

import { useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import Link from 'next/link';

const client = generateClient<Schema>();

type ResetPhase = 'idle' | 'counting' | 'confirm' | 'resetting' | 'done' | 'error';

interface Counts {
  progress: number;
  events: number;
  stories: number;
}

interface Deleted {
  progress: number;
  events: number;
  stories: number;
}

export default function DevResetPage() {
  const [phase, setPhase] = useState<ResetPhase>('idle');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  function addLog(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function handleCount() {
    setPhase('counting');
    setError(null);
    setLog([]);

    try {
      addLog('Counting records…');
      const [progressRes, eventsRes, storiesRes] = await Promise.all([
        client.models.UserWordProgress.list(),
        client.models.ReviewEvent.list(),
        client.models.Story.list(),
      ]);

      if (progressRes.errors?.length) throw new Error(progressRes.errors[0].message);
      if (eventsRes.errors?.length)   throw new Error(eventsRes.errors[0].message);
      if (storiesRes.errors?.length)  throw new Error(storiesRes.errors[0].message);

      const c: Counts = {
        progress: progressRes.data.length,
        events:   eventsRes.data.length,
        stories:  storiesRes.data.length,
      };
      setCounts(c);
      addLog(`Found: ${c.progress} progress records, ${c.events} review events, ${c.stories} stories`);
      setPhase('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to count records.');
      setPhase('error');
    }
  }

  async function handleReset() {
    setPhase('resetting');
    setError(null);

    const result: Deleted = { progress: 0, events: 0, stories: 0 };

    try {
      // Delete UserWordProgress
      addLog('Deleting progress records…');
      const { data: progressRecords } = await client.models.UserWordProgress.list();
      for (const record of progressRecords) {
        await client.models.UserWordProgress.delete({ id: record.id });
        result.progress++;
      }
      addLog(`  ✓ Deleted ${result.progress} progress records`);

      // Delete ReviewEvents
      addLog('Deleting review events…');
      const { data: eventRecords } = await client.models.ReviewEvent.list();
      for (const record of eventRecords) {
        await client.models.ReviewEvent.delete({ id: record.id });
        result.events++;
      }
      addLog(`  ✓ Deleted ${result.events} review events`);

      // Delete Stories
      addLog('Deleting stories…');
      const { data: storyRecords } = await client.models.Story.list();
      for (const record of storyRecords) {
        await client.models.Story.delete({ id: record.id });
        result.stories++;
      }
      addLog(`  ✓ Deleted ${result.stories} stories`);

      addLog('Done.');
      setDeleted(result);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed partway through.');
      setPhase('error');
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reset Progress</h1>
        <span className="text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300 px-2 py-1 rounded">
          DEV ONLY
        </span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
        <p className="text-sm text-gray-600 mb-1">
          Deletes all your <strong>UserWordProgress</strong>, <strong>ReviewEvent</strong>, and{' '}
          <strong>Story</strong> records.
        </p>
        <p className="text-sm text-gray-500">
          Word meanings and settings are untouched. This cannot be undone.
        </p>
      </div>

      {/* Log output */}
      {log.length > 0 && (
        <div className="bg-gray-900 text-gray-100 rounded-lg p-4 mb-4 font-mono text-xs space-y-1">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Done summary */}
      {phase === 'done' && deleted && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-green-800 mb-1">Reset complete</p>
          <ul className="text-sm text-green-700 space-y-0.5">
            <li>{deleted.progress} progress records deleted</li>
            <li>{deleted.events} review events deleted</li>
            <li>{deleted.stories} stories deleted</li>
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {phase === 'idle' || phase === 'error' ? (
          <button
            onClick={handleCount}
            className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Inspect records
          </button>
        ) : phase === 'confirm' && counts ? (
          <>
            <button
              onClick={handleReset}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Delete {counts.progress + counts.events + counts.stories} records
            </button>
            <button
              onClick={() => { setPhase('idle'); setLog([]); setCounts(null); }}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
            >
              Cancel
            </button>
          </>
        ) : phase === 'counting' || phase === 'resetting' ? (
          <button disabled className="bg-gray-300 text-gray-500 px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed">
            {phase === 'counting' ? 'Counting…' : 'Resetting…'}
          </button>
        ) : phase === 'done' ? (
          <button
            onClick={() => { setPhase('idle'); setLog([]); setCounts(null); setDeleted(null); }}
            className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Reset again
          </button>
        ) : null}

        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
