import Link from 'next/link';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const isRegister = mode === 'register';
  const requiresCode = Boolean(process.env.SIGNUP_CODE);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-accent" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-fg-muted">
              FPL Dashboard
            </span>
          </div>
          <h1 className="text-3xl font-medium">
            {isRegister ? 'Create an account' : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {!isRegister
              ? 'Username and password. No email, nothing to verify.'
              : requiresCode
                ? 'You need an invite code from whoever runs this.'
                : 'Pick a username and password. Sign-up closes once this account exists.'}
          </p>
        </div>

        <AuthForm mode={isRegister ? 'register' : 'signin'} requiresCode={requiresCode} />

        <p className="mt-6 text-center text-sm text-fg-muted">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              {requiresCode ? 'Got an invite code?' : 'First time here?'}{' '}
              <Link href="/login?mode=register" className="text-accent hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
