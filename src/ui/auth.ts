import type { User } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';

export interface AuthElements {
  modal: HTMLElement;
  form: HTMLFormElement;
  emailInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  errorContainer: HTMLElement;
  authButton: HTMLElement;
  cancelButton?: HTMLElement | null;
}

export interface AuthCallbacks {
  onLogin?: (user: User) => void;
  onSignOut?: () => void;
}

/**
 * Displays the login modal dialog.
 */
export function showLoginModal(modal: HTMLElement, errorContainer?: HTMLElement): void {
  if (errorContainer) {
    errorContainer.textContent = '';
    errorContainer.classList.remove('visible');
  }
  modal.classList.add('open');
}

/**
 * Hides the login modal and clears form state.
 */
export function hideLoginModal(
  modal: HTMLElement,
  form?: HTMLFormElement,
  errorContainer?: HTMLElement
): void {
  modal.classList.remove('open');
  if (form) {
    form.reset();
  }
  if (errorContainer) {
    errorContainer.textContent = '';
    errorContainer.classList.remove('visible');
  }
}

/**
 * Signs out the current Supabase session.
 */
export async function signOut(
  onSignOut?: () => void
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: new Error(error.message) };
    }
    if (onSignOut) {
      onSignOut();
    }
    return { error: null };
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Updates the header auth button text based on whether a user is logged in.
 */
export function updateAuthButton(button: HTMLElement, user: User | null): void {
  button.textContent = user ? 'Sign Out' : 'Sign In';
  button.title = user ? `Logged in as ${user.email}` : 'Sign in to sync marks';
}

/**
 * Initializes authentication listeners, login form handlers, and modal controls.
 * Returns a cleanup unbind function.
 */
export function initAuth(
  elements: AuthElements,
  callbacks: AuthCallbacks = {}
): () => void {
  let currentUser: User | null = null;

  // Sync initial auth state
  supabase.auth.getSession().then(({ data }) => {
    currentUser = data.session?.user || null;
    updateAuthButton(elements.authButton, currentUser);
    if (currentUser && callbacks.onLogin) {
      callbacks.onLogin(currentUser);
    }
  });

  // Listen to session state changes
  const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthButton(elements.authButton, currentUser);
    if (currentUser) {
      if (callbacks.onLogin) callbacks.onLogin(currentUser);
    } else {
      if (callbacks.onSignOut) callbacks.onSignOut();
    }
  });

  // Auth button click toggle
  const handleAuthButtonClick = async () => {
    if (currentUser) {
      await signOut(callbacks.onSignOut);
    } else {
      showLoginModal(elements.modal, elements.errorContainer);
      elements.emailInput.focus();
    }
  };
  elements.authButton.addEventListener('click', handleAuthButtonClick);

  // Close / Cancel modal
  const handleCancelClick = () => {
    hideLoginModal(elements.modal, elements.form, elements.errorContainer);
  };
  if (elements.cancelButton) {
    elements.cancelButton.addEventListener('click', handleCancelClick);
  }

  // Backdrop click to close
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === elements.modal) {
      hideLoginModal(elements.modal, elements.form, elements.errorContainer);
    }
  };
  elements.modal.addEventListener('click', handleBackdropClick);

  // Form submission: sign in with password
  const handleFormSubmit = async (e: Event) => {
    e.preventDefault();
    elements.errorContainer.textContent = '';
    elements.errorContainer.classList.remove('visible');

    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;

    const submitBtn = elements.form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        elements.errorContainer.textContent = error.message;
        elements.errorContainer.classList.add('visible');
        return;
      }

      hideLoginModal(elements.modal, elements.form, elements.errorContainer);

      if (data.user && callbacks.onLogin) {
        callbacks.onLogin(data.user);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      elements.errorContainer.textContent = msg;
      elements.errorContainer.classList.add('visible');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };
  elements.form.addEventListener('submit', handleFormSubmit);

  // Return unbind cleanup
  return () => {
    elements.authButton.removeEventListener('click', handleAuthButtonClick);
    if (elements.cancelButton) {
      elements.cancelButton.removeEventListener('click', handleCancelClick);
    }
    elements.modal.removeEventListener('click', handleBackdropClick);
    elements.form.removeEventListener('submit', handleFormSubmit);
    authListener.subscription.unsubscribe();
  };
}
