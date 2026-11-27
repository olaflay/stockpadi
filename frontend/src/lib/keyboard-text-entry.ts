const keyboardInputTypes = new Set(["text", "search", "number", "email", "tel", "url", "password"]);

export function isKeyboardTextEntry(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.disabled && !target.readOnly;
  return target instanceof HTMLInputElement &&
    !target.disabled && !target.readOnly && target.inputMode !== "none" &&
    keyboardInputTypes.has(target.type);
}

/** Keep a resting height for browsers that resize both viewports. */
export function createKeyboardViewportTracker() {
  let restingWidth = window.innerWidth;
  let restingHeight = window.innerHeight;
  let wasOpen = false;
  return () => {
    const viewport = window.visualViewport;
    if (!viewport) return null;
    const hasTextFocus = isKeyboardTextEntry(document.activeElement);
    if (restingWidth !== window.innerWidth || (!hasTextFocus && !wasOpen)) {
      restingWidth = window.innerWidth;
      restingHeight = window.innerHeight;
    }
    restingHeight = Math.max(restingHeight, window.innerHeight);
    const open = (viewport.scale ?? 1) <= 1.01 &&
      (hasTextFocus || wasOpen) && restingHeight - viewport.height > 100;
    wasOpen = open;
    return { viewport, open };
  };
}
