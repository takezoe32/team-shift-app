export function captureDragPointer(element, pointerId) {
  if (!element?.isConnected) return false;
  try {
    element.setPointerCapture(pointerId);
    return typeof element.hasPointerCapture === 'function' ? element.hasPointerCapture(pointerId) : true;
  } catch { return false; }
}
export function releaseDragPointer(element, pointerId) {
  try { if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId); } catch { /* The browser may already have ended this pointer. */ }
}
export function cancelPendingGesture(gesture, pointerId) {
  const state = gesture.current;
  if (!state || state.pointer !== pointerId || state.active) return false;
  clearTimeout(state.timer);
  gesture.current = null;
  return true;
}
