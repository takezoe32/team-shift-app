// Size of the meter workspace (map + input pane) on screen.
// When the on-screen keyboard opens, the visible height drops sharply while the width stays the same.
// The workspace then fits the area above the keyboard, and the map page inside keeps its pre-keyboard size
// (contentHeight) and scrolls by itself, so the map and the input pane do not shrink while typing.
export const KEYBOARD_MIN_HEIGHT = 120;

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

