import { useEffect, useRef } from 'react';
import { useDragControls } from 'motion/react';

// Dialogs inside a screen (Add/Remove person, "Did you leave the airport?") register here, so the Android back
// gesture and Escape close the dialog first instead of the whole screen behind it. Newest first.
const backStack = [];
export const closeTopDialog = () => (backStack.length ? (backStack[backStack.length - 1].current(), true) : false);
export function useBackHandler(onBack) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => { backStack.push(ref); return () => { backStack.splice(backStack.indexOf(ref), 1); }; }, []);
}

// Sheets follow the finger when pulled down by their handle, and close past a threshold or on a quick flick.
// Only the handle starts a drag, so lists inside the sheet still scroll normally.
// Focus moves to the sheet's title when it opens (screen readers announce where they are) and back to whatever
// opened it when it closes. autoFocus: false for sheets that focus a field themselves (the search box).
export function useSheetDrag(onClose, { autoFocus = true } = {}) {
  const controls = useDragControls();
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const t = autoFocus && setTimeout(() => {
      const title = ref.current?.querySelector('h1, h2');
      if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
    }, 350); // after the slide-in, so focusing doesn't make the page jump
    return () => { clearTimeout(t); before?.focus?.({ preventScroll: true }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    sheet: {
      ref, drag: 'y', dragControls: controls, dragListener: false, dragSnapToOrigin: true,
      dragConstraints: { top: 0, bottom: 0 }, dragElastic: { top: 0, bottom: 1 },
      onDragEnd: (e, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); },
    },
    handle: <div className="handle" onPointerDown={e => controls.start(e)} aria-hidden="true"><span /></div>,
  };
}
