let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Displays a temporary toast notification message in the provided toast element.
 *
 * @param toastElement The container DOM element (e.g. `#t`)
 * @param message The text content to display
 * @param duration Milliseconds until the toast auto-dismisses (default: 2600)
 */
export function showToast(
  toastElement: HTMLElement,
  message: string,
  duration = 2600
): void {
  toastElement.textContent = message;
  toastElement.classList.add('s');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toastElement.classList.remove('s');
    toastTimer = undefined;
  }, duration);
}

/**
 * Factory that returns a bound toast function for a given container element.
 */
export function createToast(toastElement: HTMLElement) {
  return (message: string, duration = 2600): void => {
    showToast(toastElement, message, duration);
  };
}
