import type { User } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';

export type AuthMode = 'signin' | 'signup';

export interface AuthElements {
  authScreen: HTMLElement;
  appRoot: HTMLElement;
  disabledScreen?: HTMLElement | null;
  disabledSignOutButton?: HTMLElement | null;
  form: HTMLFormElement;
  emailInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  errorContainer: HTMLElement;
  successContainer?: HTMLElement | null;
  authButton?: HTMLElement | null;
  tabSignIn?: HTMLElement | null;
  tabSignUp?: HTMLElement | null;
  title?: HTMLElement | null;
  subtitle?: HTMLElement | null;
  submitButton?: HTMLButtonElement | null;
}

export interface AuthCallbacks {
  onLogin?: (user: User) => void | Promise<void>;
  onSignOut?: () => void | Promise<void>;
}

export function showAuthScreen(elements: {
  authScreen: HTMLElement;
  appRoot: HTMLElement;
  disabledScreen?: HTMLElement | null;
}): void {
  elements.authScreen.style.display = 'flex';
  elements.appRoot.style.display = 'none';
  if (elements.disabledScreen) {
    elements.disabledScreen.style.display = 'none';
  }
}

export function showAppScreen(elements: {
  authScreen: HTMLElement;
  appRoot: HTMLElement;
  disabledScreen?: HTMLElement | null;
}): void {
  elements.authScreen.style.display = 'none';
  elements.appRoot.style.display = 'flex';
  if (elements.disabledScreen) {
    elements.disabledScreen.style.display = 'none';
  }
}

export function showDisabledScreen(elements: {
  authScreen: HTMLElement;
  appRoot: HTMLElement;
  disabledScreen?: HTMLElement | null;
}): void {
  elements.authScreen.style.display = 'none';
  elements.appRoot.style.display = 'none';
  if (elements.disabledScreen) {
    elements.disabledScreen.style.display = 'flex';
  }
}

/**
 * Signs out the current Supabase session.
 */
export async function signOut(
  onSignOut?: () => void | Promise<void>
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: new Error(error.message) };
    }
    if (onSignOut) {
      await onSignOut();
    }
    return { error: null };
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Initializes authentication listeners, login/signup form handlers, and gate screens.
 * Returns a cleanup unbind function.
 */
export function initAuth(
  elements: AuthElements,
  callbacks: AuthCallbacks = {}
): () => void {
  let currentUser: User | null = null;
  let currentMode: AuthMode = 'signin';

  const setAuthMode = (mode: AuthMode) => {
    currentMode = mode;
    if (elements.errorContainer) {
      elements.errorContainer.textContent = '';
      elements.errorContainer.classList.remove('visible');
    }
    if (elements.successContainer) {
      elements.successContainer.textContent = '';
      elements.successContainer.classList.remove('visible');
    }

    if (mode === 'signin') {
      elements.tabSignIn?.classList.add('on');
      elements.tabSignUp?.classList.remove('on');
      if (elements.title) elements.title.textContent = 'RCD Status Map';
      if (elements.subtitle) {
        elements.subtitle.textContent =
          'Sign in to view real-time subdivision lot availability';
      }
      if (elements.submitButton) elements.submitButton.textContent = 'Sign In';
    } else {
      elements.tabSignUp?.classList.add('on');
      elements.tabSignIn?.classList.remove('on');
      if (elements.title) elements.title.textContent = 'Create Viewer Account';
      if (elements.subtitle) {
        elements.subtitle.textContent =
          'Sign up to watch real-time subdivision status updates';
      }
      if (elements.submitButton) elements.submitButton.textContent = 'Create Account';
    }
  };

  // Tab switching
  const handleTabSignIn = () => setAuthMode('signin');
  const handleTabSignUp = () => setAuthMode('signup');
  elements.tabSignIn?.addEventListener('click', handleTabSignIn);
  elements.tabSignUp?.addEventListener('click', handleTabSignUp);

  // Sync initial auth state
  supabase.auth.getSession().then(async ({ data }) => {
    currentUser = data.session?.user || null;
    if (currentUser) {
      if (callbacks.onLogin) {
        await callbacks.onLogin(currentUser);
      }
    } else {
      showAuthScreen(elements);
      if (callbacks.onSignOut) {
        await callbacks.onSignOut();
      }
    }
  });

  // Listen to session state changes
  const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) {
      if (callbacks.onLogin) {
        await callbacks.onLogin(currentUser);
      }
    } else {
      showAuthScreen(elements);
      if (callbacks.onSignOut) {
        await callbacks.onSignOut();
      }
    }
  });

  // Header auth button (Sign Out)
  const handleAuthButtonClick = async () => {
    if (currentUser) {
      await signOut(async () => {
        showAuthScreen(elements);
        if (callbacks.onSignOut) await callbacks.onSignOut();
      });
    } else {
      showAuthScreen(elements);
    }
  };
  elements.authButton?.addEventListener('click', handleAuthButtonClick);

  // Disabled account sign out button
  elements.disabledSignOutButton?.addEventListener('click', async () => {
    await signOut(async () => {
      showAuthScreen(elements);
      if (callbacks.onSignOut) await callbacks.onSignOut();
    });
  });

  // Form submission: sign in OR sign up
  const handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    if (elements.errorContainer) {
      elements.errorContainer.textContent = '';
      elements.errorContainer.classList.remove('visible');
    }
    if (elements.successContainer) {
      elements.successContainer.textContent = '';
      elements.successContainer.classList.remove('visible');
    }

    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;

    const submitBtn =
      elements.submitButton ||
      elements.form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = currentMode === 'signin' ? 'Signing in...' : 'Creating...';
    }

    try {
      if (currentMode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          elements.errorContainer.textContent = error.message;
          elements.errorContainer.classList.add('visible');
          return;
        }

        if (data.user && callbacks.onLogin) {
          await callbacks.onLogin(data.user);
        }
      } else {
        // Sign Up flow
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          elements.errorContainer.textContent = error.message;
          elements.errorContainer.classList.add('visible');
          return;
        }

        // If email confirmation is disabled or session was created immediately
        if (data.session && data.user) {
          if (callbacks.onLogin) {
            await callbacks.onLogin(data.user);
          }
        } else {
          // Confirmation email sent
          if (elements.successContainer) {
            elements.successContainer.textContent =
              'Registration successful! Please check your email to confirm your account, then sign in.';
            elements.successContainer.classList.add('visible');
          }
          setAuthMode('signin');
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      elements.errorContainer.textContent = msg;
      elements.errorContainer.classList.add('visible');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = currentMode === 'signin' ? 'Sign In' : 'Create Account';
      }
    }
  };
  elements.form.addEventListener('submit', handleFormSubmit);

  return () => {
    elements.tabSignIn?.removeEventListener('click', handleTabSignIn);
    elements.tabSignUp?.removeEventListener('click', handleTabSignUp);
    elements.authButton?.removeEventListener('click', handleAuthButtonClick);
    elements.form.removeEventListener('submit', handleFormSubmit);
    authListener.subscription.unsubscribe();
  };
}
