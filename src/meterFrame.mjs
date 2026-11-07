// Size of the meter workspace (map + input pane) on screen.
// When the on-screen keyboard opens, the visible height drops sharply while the width stays the same.
// The map and the input pane then keep their size (contentHeight), and the workspace itself becomes
// a scroll box that fits the area above the keyboard, so both can be scrolled into view while typing.
export const KEYBOARD_MIN_HEIGHT = 120;
const REVEAL_MARGIN = 12;

const keyboardOpen = (base, width, height) => !!base && Math.abs(width - base.width) < 2 && height < base.height - KEYBOARD_MIN_HEIGHT;

export function meterFrameBox(state = {}, { width, height, offsetTop = 0, headerBottom = 0, navHeight = 0, navTop = Infinity }) {
  const top = Math.max(offsetTop, headerBottom);
  if (state.box && keyboardOpen(state.base, width, height)) {
    const visible = Math.max(100, Math.min(state.full, Math.min(height + offsetTop, navTop) - top));
    return { ...state, keyboard: true, box: { top, height: visible, contentHeight: state.full } };
  }
  const full = Math.max(150, height + offsetTop - top - navHeight);
  return { base: { width, height }, full, keyboard: false, box: { top, height: full, contentHeight: full } };
}

// How far to scroll the workspace so the focused input is visible inside it (0 when it already is).
export function revealDelta(view, target, margin = REVEAL_MARGIN) {
  if (target.bottom > view.bottom - margin) return Math.min(target.bottom - view.bottom + margin, target.top - view.top - margin);
  if (target.top < view.top + margin) return target.top - view.top - margin;
  return 0;
}
