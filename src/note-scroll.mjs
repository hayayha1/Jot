// Scroll the note viewport only; never ask the browser to scroll ancestor pages.
export function noteScrollTarget(scroller, viewport, rect, { center = false, margin = 18 } = {}) {
  const top = viewport.top + (scroller.clientTop || 0);
  const bottom = top + scroller.clientHeight;
  let target = scroller.scrollTop;
  if (center) {
    const height = Math.min(rect.bottom - rect.top, scroller.clientHeight);
    target += rect.top - top - Math.max(margin, (scroller.clientHeight - height) / 2);
  } else if (rect.top < top + margin) {
    target += rect.top - top - margin;
  } else if (rect.bottom > bottom - margin) {
    target += rect.bottom - bottom + margin;
  }
  return Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
}

export function revealNoteElement(element, { behavior = 'smooth', center = true } = {}) {
  const scroller = element?.closest('.document-scroll');
  if (!scroller) return;
  const top = noteScrollTarget(scroller, scroller.getBoundingClientRect(), element.getBoundingClientRect(), { center });
  scroller.scrollTo({ top, behavior });
}

export function scrollNoteToSelection(view) {
  const scroller = view.dom.closest('.document-scroll');
  if (!scroller) return false;
  try {
    const top = noteScrollTarget(scroller, scroller.getBoundingClientRect(), view.coordsAtPos(view.state.selection.head));
    if (Math.abs(top - scroller.scrollTop) > 1) scroller.scrollTo({ top, behavior: 'instant' });
  } catch {
    // A removed node may briefly have no coordinates; keep outer chrome stationary.
  }
  return true;
}
