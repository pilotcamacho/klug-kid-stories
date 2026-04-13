'use client';

import Link from 'next/link';
import type { EmptyReason } from '@/lib/session';

interface EmptySessionProps {
  reason: EmptyReason;
}

const MESSAGES: Record<EmptyReason, { heading: string; body: string; action?: { label: string; href: string } }> = {
  daily_limit_reached: {
    heading: "You're done for today!",
    body: "You've reached your daily review limit. Come back tomorrow to continue.",
  },
  nothing_due: {
    heading: 'Nothing due right now.',
    body: 'All your words are scheduled for a future date. Check back later.',
  },
  no_vocabulary: {
    heading: 'No vocabulary yet.',
    body: 'Add some words to your list before starting a review session.',
    action: { label: 'Go to Vocabulary', href: '/vocabulary' },
  },
};

export default function EmptySession({ reason }: EmptySessionProps) {
  const { heading, body, action } = MESSAGES[reason];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
      <p className="text-lg font-semibold text-gray-900 mb-2">{heading}</p>
      <p className="text-sm text-gray-500 mb-6">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
