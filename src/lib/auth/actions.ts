'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Supabase Auth identifies users by email, but this app logs in with a username.
 * We map one to the other with a fixed internal domain: the username is the real
 * identity (unique in `profiles`), and the address is never used to send mail.
 * Email confirmation is disabled in the Supabase dashboard, so nothing is sent.
 */
const INTERNAL_DOMAIN = 'fpldash.local';

const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${INTERNAL_DOMAIN}`;

/** Letters, digits and underscores. Keeps the synthetic address valid. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export interface AuthState {
  error?: string;
}

function validate(formData: FormData): { username: string; password: string } | string {
  const username = String(formData.get('username') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!USERNAME_PATTERN.test(username)) {
    return 'Username must be 3-24 characters, using only letters, numbers and underscores.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  return { username, password };
}

/**
 * Has anyone registered yet?
 *
 * Needs the secret-key client: RLS restricts `profiles` to the caller's own row,
 * and during sign-up there is no session to be restricted to. Fails closed — if
 * we cannot tell, we refuse rather than allow an open registration.
 */
async function hasAnyUser(): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('sign-up: could not check for existing users', error);
    return true;
  }
  return (count ?? 0) > 0;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = validate(formData);
  if (typeof parsed === 'string') return { error: parsed };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(parsed.username),
    password: parsed.password,
  });

  // Deliberately vague: don't reveal whether the username exists.
  if (error) return { error: 'Incorrect username or password.' };

  redirect('/');
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = validate(formData);
  if (typeof parsed === 'string') return { error: parsed };

  // The deployed URL must not be openly registerable — otherwise anyone who
  // finds it can create an account and burn through the free LLM quotas.
  //
  // Two ways to be allowed in:
  //   1. SIGNUP_CODE is set and matches (for inviting other people later), or
  //   2. nobody has registered yet, so this is the owner claiming the app.
  // Once an account exists and no code is configured, sign-up closes for good.
  const expectedCode = process.env.SIGNUP_CODE;

  if (expectedCode) {
    if (String(formData.get('code') ?? '') !== expectedCode) {
      return { error: 'That invite code is not valid.' };
    }
  } else if (await hasAnyUser()) {
    return {
      error:
        'Sign-up is closed. Set SIGNUP_CODE on the server to invite more people.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: usernameToEmail(parsed.username),
    password: parsed.password,
    // Picked up by the handle_new_user trigger to populate profiles.username.
    options: { data: { username: parsed.username } },
  });

  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return { error: taken ? 'That username is taken.' : error.message };
  }

  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
