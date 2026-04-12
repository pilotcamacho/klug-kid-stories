'use client';

import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

/**
 * Wraps protected sections of the app with Amplify's Authenticator.
 * Any child rendered inside this component is only visible to signed-in users.
 */
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Authenticator
      variation="modal"
      components={{
        Header() {
          return (
            <div className="flex flex-col items-center py-6">
              <h1 className="text-2xl font-bold text-gray-900">Klug Kid Stories</h1>
              <p className="text-sm text-gray-500 mt-1">Learn languages through stories</p>
            </div>
          );
        },
      }}
    >
      {() => <>{children}</>}
    </Authenticator>
  );
}
