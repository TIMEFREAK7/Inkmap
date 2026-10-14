import { useDragControls } from 'motion/react';

// Sheets follow the finger when pulled down by their handle, and close past a threshold or on a quick flick.
// Only the handle starts a drag, so lists inside the sheet still scroll normally.
export function useSheetDrag(onClose) {
  const controls = useDragControls();
  return {
    sheet: {
      drag: 'y', dragControls: controls, dragListener: false, dragSnapToOrigin: true,
      dragConstraints: { top: 0, bottom: 0 }, dragElastic: { top: 0, bottom: 1 },
      onDragEnd: (e, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); },
    },
    handle: <div className="handle" onPointerDown={e => controls.start(e)} aria-hidden="true"><span /></div>,
  };
}
