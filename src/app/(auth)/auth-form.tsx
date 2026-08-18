'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, signUp, type AuthState } from '@/lib/auth/actions';

const field =
  'w-full rounded-none border border-border/50 bg-surface px-3 py-2.5 text-sm text-fg ' +
  'placeholder:text-fg-dim outline-none transition-colors ' +
  'focus:border-accent focus:ring-1 focus:ring-accent';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-none border border-accent px-3 py-2.5 text-sm font-medium
                 text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
    >
      {pending ? 'Working…' : label}
    </button>
  );
}

export function AuthForm({
  mode,
  requiresCode = false,
}: {
  mode: 'signin' | 'register';
  requiresCode?: boolean;
}) {
  const isRegister = mode === 'register';
  const action = isRegister ? signUp : signIn;
  const [state, formAction] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-fg-muted">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="jake"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-fg-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          placeholder="At least 8 characters"
          className={field}
        />
      </div>

      {isRegister && requiresCode && (
        <div>
          <label htmlFor="code" className="mb-1.5 block text-xs font-medium text-fg-muted">
            Invite code
          </label>
          <input id="code" name="code" type="text" required className={field} />
        </div>
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-none border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="pt-1">
        <Submit label={isRegister ? 'Create account' : 'Sign in'} />
      </div>
    </form>
  );
}
