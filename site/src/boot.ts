// How this page started: from the HTML the build wrote for it (the page
// already on screen), or from scratch (in development). Animations that
// would hide what's already showing only play in the second case.

let fromHtml = false;

export function startedFromHtml(): boolean {
  return fromHtml;
}

export function noteStart(rootHadContent: boolean): void {
  fromHtml = rootHadContent;
}
