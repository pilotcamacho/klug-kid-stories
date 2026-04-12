'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/vocabulary', label: 'Vocabulary' },
  { href: '/review', label: 'Review' },
  { href: '/settings', label: 'Settings' },
];

export default function NavBar() {
  const pathname = usePathname();
  const { signOut, user } = useAuthenticator((ctx) => [ctx.user]);

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900 text-lg">Klug Kid</span>
          <div className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.signInDetails?.loginId}</span>
          <button
            onClick={signOut}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
