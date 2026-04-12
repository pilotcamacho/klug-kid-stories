'use client';

import AuthProvider from '@/app/components/AuthProvider';
import NavBar from '@/app/components/NavBar';

/**
 * Layout for all authenticated routes under (app)/.
 * Wraps children with the Authenticator gate and the top navigation bar.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">{children}</main>
      </div>
    </AuthProvider>
  );
}
