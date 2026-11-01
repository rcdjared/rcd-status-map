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
  toastElement.classList.remove('has-action');
  toastElement.classList.add('s');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toastElement.classList.remove('s');
    toastTimer = undefined;
  }, duration);
}

export function showActionToast(
  toastElement: HTMLElement,
  message: string,
  actionLabel: string,
  onAction: () => void | Promise<void>,
  duration = 5000
): void {
  toastElement.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  const action = document.createElement('button');
  action.type = 'button';
  action.textContent = actionLabel;
  action.addEventListener('click', () => {
    action.disabled = true;
    toastElement.classList.remove('s', 'has-action');
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = undefined;
    }
    void onAction();
  });
  toastElement.append(text, action);
  toastElement.classList.add('s', 'has-action');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    toastElement.classList.remove('s', 'has-action');
    toastElement.replaceChildren();
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
