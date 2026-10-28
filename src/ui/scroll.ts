// Redrawing part of a menu (after picking a hat, a rule, a section) must not
// lose your place in it. Phones' browsers (iOS Safari especially) snap a
// scrolled box back to the top the moment its contents are cleared, before
// the new ones go in, so the place is noted first and put back after.

/** Note where every scrolled box in `root` (and `root` itself) is; call the result after redrawing. */
export function keepPlace(root: HTMLElement): () => void {
  const kept: { path: number[]; left: number; top: number }[] = [];
  const walk = (e: Element, path: number[]) => {
    if (e.scrollTop > 0 || e.scrollLeft > 0) kept.push({ path, left: e.scrollLeft, top: e.scrollTop });
    for (let i = 0; i < e.children.length; i++) walk(e.children[i], [...path, i]);
  };
  walk(root, []);
  return () => {
    for (const { path, left, top } of kept) path.reduce<Element | undefined>((at, i) => at?.children[i], root)?.scrollTo(left, top);
  };
}

/** The same, put back by itself once the redraw that starts now has finished. */
export function keepPlaceAfter(root: HTMLElement): void {
  queueMicrotask(keepPlace(root));
}
