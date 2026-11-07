// Size of the meter workspace (map + input pane) on screen.
// When the on-screen keyboard opens, the visible height drops sharply while the width stays the same.
// The workspace then keeps its size so the map and the input pane do not shrink while typing.
export const KEYBOARD_MIN_HEIGHT = 120;

const keyboardOpen = (base, width, height) => !!base && Math.abs(width - base.width) < 2 && height < base.height - KEYBOARD_MIN_HEIGHT;

export function meterFrameBox(state = {}, { width, height, offsetTop = 0, headerBottom = 0, navHeight = 0 }) {
  if (state.box && keyboardOpen(state.base, width, height)) return state;
  const top = Math.max(offsetTop, headerBottom);
  return { base: { width, height }, box: { top, height: Math.max(150, height + offsetTop - top - navHeight) } };
}
