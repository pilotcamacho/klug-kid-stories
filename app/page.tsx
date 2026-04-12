import { redirect } from 'next/navigation';

/**
 * Root route — redirect to the main app entry point.
 */
export default function Home() {
  redirect('/dashboard');
}
