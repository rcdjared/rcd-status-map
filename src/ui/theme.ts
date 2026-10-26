export type Theme = 'light' | 'dark-green';

const THEME_STORAGE_KEY = 'rcd-theme';

/**
 * Retrieves the currently saved theme from localStorage or falls back to system preference.
 */
export function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark-green' || saved === 'dark') {
      return 'dark-green';
    }
    if (saved === 'light') {
      return 'light';
    }
  } catch {
    // Ignore storage access errors
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark-green';
  }
  return 'light';
}

/**
 * Applies the theme by setting data-theme attribute on document root and updating all toggle buttons.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors
  }

  const toggleButtons = document.querySelectorAll<HTMLElement>('.theme-toggle-btn');
  toggleButtons.forEach((btn) => {
    const icon = btn.querySelector('.theme-btn-icon');
    const text = btn.querySelector('.theme-btn-text');
    if (theme === 'dark-green') {
      if (icon) icon.textContent = '🌲';
      if (text) text.textContent = 'Dark Green';
      btn.setAttribute('aria-label', 'Switch to Light Mode');
      btn.title = 'Current: Dark Green (click to switch to Light)';
      btn.classList.add('is-dark-green');
    } else {
      if (icon) icon.textContent = '☀️';
      if (text) text.textContent = 'Light';
      btn.setAttribute('aria-label', 'Switch to Dark Green Mode');
      btn.title = 'Current: Light (click to switch to Dark Green)';
      btn.classList.remove('is-dark-green');
    }
  });
}

/**
 * Initializes theme listeners and binds to all .theme-toggle-btn elements in the DOM.
 */
export function initTheme(): {
  getTheme: () => Theme;
  toggleTheme: () => Theme;
} {
  let currentTheme = getStoredTheme();
  applyTheme(currentTheme);

  const toggleTheme = (): Theme => {
    currentTheme = currentTheme === 'light' ? 'dark-green' : 'light';
    applyTheme(currentTheme);
    return currentTheme;
  };

  const buttons = document.querySelectorAll<HTMLElement>('.theme-toggle-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleTheme();
    });
  });

  return {
    getTheme: () => currentTheme,
    toggleTheme,
  };
}
