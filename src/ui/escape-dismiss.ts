export interface EscapeDismissal {
  activate(): void;
  deactivate(): void;
}

interface DismissableEntry {
  element: HTMLElement;
  dismiss: () => void | boolean | Promise<void | boolean>;
}

const stack: DismissableEntry[] = [];

export function registerEscapeDismissable(
  element: HTMLElement,
  dismiss: () => void | boolean | Promise<void | boolean>
): EscapeDismissal {
  const entry = { element, dismiss };
  return {
    activate() {
      const currentIndex = stack.indexOf(entry);
      if (currentIndex >= 0) stack.splice(currentIndex, 1);
      stack.push(entry);
    },
    deactivate() {
      const currentIndex = stack.indexOf(entry);
      if (currentIndex >= 0) stack.splice(currentIndex, 1);
    },
  };
}

export async function dismissLastEscapeDismissable(): Promise<boolean> {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].element.isConnected === false) stack.splice(index, 1);
  }

  const top = stack.at(-1);
  if (!top) return false;

  const dismissed = await top.dismiss();
  if (dismissed !== false) {
    const index = stack.indexOf(top);
    if (index >= 0) stack.splice(index, 1);
  }
  return true;
}

export function initEscapeDismissal(root: HTMLElement = document.body): () => void {
  const observedDetails = new WeakSet<HTMLDetailsElement>();

  const observeDetails = (element: Element): void => {
    if (element instanceof HTMLDetailsElement && !observedDetails.has(element)) {
      observedDetails.add(element);
      const dismissal = registerEscapeDismissable(element, () => {
        element.open = false;
        element.querySelector<HTMLElement>(':scope > summary')?.focus();
      });
      element.addEventListener('toggle', () => {
        if (element.open) dismissal.activate();
        else dismissal.deactivate();
      });
      if (element.open) dismissal.activate();
    }

    element.querySelectorAll('details').forEach((details) => observeDetails(details));
  };

  observeDetails(root);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) observeDetails(node);
      });
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (!stack.length) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void dismissLastEscapeDismissable();
  };
  window.addEventListener('keydown', onKeyDown, true);

  return () => {
    observer.disconnect();
    window.removeEventListener('keydown', onKeyDown, true);
    stack.length = 0;
  };
}
