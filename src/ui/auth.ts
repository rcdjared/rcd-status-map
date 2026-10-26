import type { User } from '@supabase/supabase-js';
import { supabase } from '../api/supabase';

export type AuthMode = 'signin' | 'signup';

export interface AuthElements {
  modal: HTMLElement;
  form: HTMLFormElement;
  emailInput: HTMLInputElement;
  passwordInput: HTMLInputElement;
  errorContainer: HTMLElement;
  successContainer?: HTMLElement | null;
  authButton: HTMLElement;
  cancelButton?: HTMLElement | null;
  tabSignIn?: HTMLElement | null;
  tabSignUp?: HTMLElement | null;
  title?: HTMLElement | null;
  subtitle?: HTMLElement | null;
  submitButton?: HTMLButtonElement | null;
}

export interface AuthCallbacks {
  onLogin?: (user: User) => void;
  onSignOut?: () => void;
}

/**
 * Displays the login modal dialog.
 */
export function showLoginModal(
  modal: HTMLElement,
  errorContainer?: HTMLElement,
  successContainer?: HTMLElement | null
): void {
  if (errorContainer) {
    errorContainer.textContent = '';
    errorContainer.classList.remove('visible');
  }
  if (successContainer) {
    successContainer.textContent = '';
    successContainer.classList.remove('visible');
  }
  modal.classList.add('open');
}

/**
 * Hides the login modal and clears form state.
 */
export function hideLoginModal(
  modal: HTMLElement,
  form?: HTMLFormElement,
  errorContainer?: HTMLElement,
  successContainer?: HTMLElement | null
): void {
  modal.classList.remove('open');
  if (form) {
    form.reset();
  }
  if (errorContainer) {
    errorContainer.textContent = '';
    errorContainer.classList.remove('visible');
  }
  if (successContainer) {
    successContainer.textContent = '';
    successContainer.classList.remove('visible');
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
  button.title = user ? `Logged in as ${user.email}` : 'Sign in to access account';
}

/**
 * Initializes authentication listeners, login/signup form handlers, and modal controls.
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
      if (elements.title) elements.title.textContent = 'Sign In';
      if (elements.subtitle) {
        elements.subtitle.textContent = 'Sign in to access editor tools or view live map status';
      }
      if (elements.submitButton) elements.submitButton.textContent = 'Sign In';
    } else {
      elements.tabSignUp?.classList.add('on');
      elements.tabSignIn?.classList.remove('on');
      if (elements.title) elements.title.textContent = 'Create Viewer Account';
      if (elements.subtitle) {
        elements.subtitle.textContent = 'Sign up to watch real-time subdivision status updates';
      }
      if (elements.submitButton) elements.submitButton.textContent = 'Create Account';
    }
  };

  // Tab click listeners
  const handleTabSignIn = () => setAuthMode('signin');
  const handleTabSignUp = () => setAuthMode('signup');
  elements.tabSignIn?.addEventListener('click', handleTabSignIn);
  elements.tabSignUp?.addEventListener('click', handleTabSignUp);

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
      setAuthMode('signin');
      showLoginModal(elements.modal, elements.errorContainer, elements.successContainer);
      elements.emailInput.focus();
    }
  };
  elements.authButton.addEventListener('click', handleAuthButtonClick);

  // Close / Cancel modal
  const handleCancelClick = () => {
    hideLoginModal(
      elements.modal,
      elements.form,
      elements.errorContainer,
      elements.successContainer
    );
  };
  if (elements.cancelButton) {
    elements.cancelButton.addEventListener('click', handleCancelClick);
  }

  // Backdrop click to close
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === elements.modal) {
      hideLoginModal(
        elements.modal,
        elements.form,
        elements.errorContainer,
        elements.successContainer
      );
    }
  };
  elements.modal.addEventListener('click', handleBackdropClick);

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

    const submitBtn = elements.submitButton ||
      elements.form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

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

        hideLoginModal(
          elements.modal,
          elements.form,
          elements.errorContainer,
          elements.successContainer
        );

        if (data.user && callbacks.onLogin) {
          callbacks.onLogin(data.user);
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

        // If email confirmation is disabled or auto-confirmed
        if (data.session && data.user) {
          hideLoginModal(
            elements.modal,
            elements.form,
            elements.errorContainer,
            elements.successContainer
          );
          if (callbacks.onLogin) {
            callbacks.onLogin(data.user);
          }
        } else {
          // Confirmation required
          if (elements.successContainer) {
            elements.successContainer.textContent =
              'Account created! Please check your email to confirm, then sign in.';
            elements.successContainer.classList.add('visible');
          }
          setAuthMode('signin');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      elements.errorContainer.textContent = msg;
      elements.errorContainer.classList.add('visible');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };
  elements.form.addEventListener('submit', handleFormSubmit);

  // Return unbind cleanup
  return () => {
    elements.tabSignIn?.removeEventListener('click', handleTabSignIn);
    elements.tabSignUp?.removeEventListener('click', handleTabSignUp);
    elements.authButton.removeEventListener('click', handleAuthButtonClick);
    if (elements.cancelButton) {
      elements.cancelButton.removeEventListener('click', handleCancelClick);
    }
    elements.modal.removeEventListener('click', handleBackdropClick);
    elements.form.removeEventListener('submit', handleFormSubmit);
    authListener.subscription.unsubscribe();
  };
}
