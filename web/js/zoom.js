// Pinch / wheel zoom and drag-pan for images (the plate, the anatomy viewer).
export /** Pinch / wheel zoom and drag-pan for an image inside `box`; double-tap resets. */
function zoomable(box, img, opts = {}) {
  let z = 1, px = 0, py = 0, pinch = null, lastTap = 0, swipe = null;
  const pts = new Map();
  const apply = () => { if (z <= 1.01) { z = 1; px = 0; py = 0; } img.style.transform = `translate(${px}px, ${py}px) scale(${z})`; };
  box.style.touchAction = 'none'; img.style.transformOrigin = 'center center'; img.draggable = false;
  box.addEventListener('pointerdown', (e) => {
    // buttons on the image (the plate arrows) must get their own taps: no capture, no zoom
    if (e.target.closest && e.target.closest('button, a, input, select')) return;
    box.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    swipe = pts.size === 1 && z <= 1.01 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; }
    const now = performance.now(); if (pts.size === 1 && now - lastTap < 300) { z = 1; apply(); } lastTap = now;
  });
  box.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId); if (!prev) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; z = Math.min(6, Math.max(1, pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)); }
    else if (pts.size === 1 && z > 1) { px += e.clientX - prev[0]; py += e.clientY - prev[1]; }
    apply();
  });
  const up = (e) => {
    // a quick sideways swipe (not zoomed in): the previous / next picture
    if (swipe && opts.onSwipe && e.type === 'pointerup' && pts.size === 1) {
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.abs(dx) > 45 && Math.abs(dy) < Math.abs(dx) * 0.6 && performance.now() - swipe.t < 700) opts.onSwipe(dx < 0 ? 1 : -1);
    }
    swipe = null;
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null; apply();
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', (e) => { e.preventDefault(); z = Math.min(6, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 0.9))); apply(); }, { passive: false });
  return { reset() { z = 1; apply(); } };
}
