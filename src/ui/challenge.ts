// Daily challenges in the game (src/challenge/daily.ts): pick today's Targets
// or Rope Race, and afterwards see your result, send it to the leaderboard
// (signed in) and see where you placed. The website shows the same boards.

import { CHALLENGE_KINDS, TARGET_COUNT, TARGET_TURNS, challengeDay, type ChallengeKind } from '../challenge/meta';
import type { ChallengeResult } from '../challenge/daily';
import { TICK_RATE } from '../sim/types';
import { account, challengeBoard, submitChallenge, type BoardRow } from '../account/session';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const CHALLENGE_INFO: Record<ChallengeKind, { title: string; blurb: string }> = {
  targets: {
    title: '🎯 Target Smash',
    blurb: `Pop as many of the ${TARGET_COUNT} targets as you can in ${TARGET_TURNS} turns. Everyone gets the same map, wind and targets today.`,
  },
  rope: {
    title: '🕸️ Rope Race',
    blurb: 'Today’s course: swing from the start to the flag. Your best of three tries counts.',
  },
};

/** How a result reads: "6 / 8 targets in 182.4s", "41.36s". */
export function resultText(kind: ChallengeKind, value: number, ticks: number): string {
  if (kind === 'rope') return value < 0 ? 'No finish' : `${(value / TICK_RATE).toFixed(2)}s`;
  return `${value} / ${TARGET_COUNT} targets in ${(ticks / TICK_RATE).toFixed(1)}s`;
}

/** A leaderboard list. */
export function boardList(kind: ChallengeKind, rows: BoardRow[], me: BoardRow | null): HTMLElement {
  const ol = el('ol', 'board');
  if (!rows.length) ol.append(el('li', 'board-empty', 'Nobody yet today: be the first!'));
  for (const r of rows) {
    const li = el('li', r.you ? 'you' : '');
    li.append(el('span', 'board-rank', `${r.rank}`), el('span', 'board-name', r.name), el('span', 'board-value', resultText(kind, r.value, r.ticks)));
    ol.append(li);
  }
  if (me && !rows.some((r) => r.you)) {
    const li = el('li', 'you');
    li.append(el('span', 'board-rank', `${me.rank}`), el('span', 'board-name', `${me.name} (you)`), el('span', 'board-value', resultText(kind, me.value, me.ticks)));
    ol.append(li);
  }
  return ol;
}

/** The chooser: today's two challenges, each with its top three. */
export function chooseChallenge(host: HTMLElement, onPick: (kind: ChallengeKind) => void): void {
  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor practice-choice');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Daily challenge');
  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  box.append(el('h2', 'editor-title', '🏆 Daily challenge'), el('p', 'account-note', `New every day at midnight (UTC). ${account().me?.user ? 'Your best run goes on the leaderboard.' : 'Sign in to put your score on the leaderboard.'}`));
  const day = challengeDay();
  for (const kind of CHALLENGE_KINDS) {
    const b = el('button', 'practice-option');
    b.append(el('b', '', CHALLENGE_INFO[kind].title), el('span', '', CHALLENGE_INFO[kind].blurb));
    const top = el('span', 'board-top');
    b.append(top);
    b.onclick = () => {
      close();
      onPick(kind);
    };
    box.append(b);
    if (account().me) {
      void challengeBoard(kind, day).then((r) => {
        if (r?.rows.length) top.textContent = `🥇 ${r.rows[0].name}: ${resultText(kind, r.rows[0].value, r.rows[0].ticks)}`;
      });
    }
  }
  const cancel = el('button', 'hud-btn', 'Cancel');
  cancel.onclick = close;
  box.append(cancel);
  overlay.append(box);
  host.append(overlay);
}

/** After a run: the result, sending it, and today's board. */
export function showChallengeResult(
  host: HTMLElement,
  kind: ChallengeKind,
  day: string,
  result: ChallengeResult,
  packed: unknown,
  onAgain: () => void,
  onMenu: () => void,
): void {
  const overlay = el('div', 'overlay');
  const box = el('div', 'overlay-box gameover-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Challenge result');
  box.append(el('h1', 'title-small', CHALLENGE_INFO[kind].title), el('p', 'challenge-result', resultText(kind, result.value, result.ticks)));
  const status = el('p', 'account-note');
  status.setAttribute('role', 'status');
  const boardBox = el('div', 'gameover-stats');
  box.append(status, boardBox);
  const showBoard = async () => {
    const b = await challengeBoard(kind, day);
    boardBox.replaceChildren(el('h2', 'card-title', 'Today’s leaderboard'), b ? boardList(kind, b.rows.slice(0, 10), b.me) : el('p', 'account-note', 'The leaderboard can’t be reached right now.'));
  };
  if (!account().me?.user) {
    status.textContent = 'Sign in (Account in the menu) to put your score on the leaderboard.';
    if (account().me) void showBoard();
  } else {
    status.textContent = 'Checking your run…';
    submitChallenge(kind, day, packed).then(
      (r) => {
        status.textContent = r.me ? `You’re number ${r.me.rank} today!` : 'Sent.';
        void showBoard();
      },
      (e: Error) => {
        status.textContent = e.message;
        void showBoard();
      },
    );
  }
  const go = el('div', 'gameover-go');
  const again = el('button', 'big-btn', 'Try again');
  again.onclick = onAgain;
  const menu = el('button', 'big-btn secondary', 'Main menu');
  menu.onclick = onMenu;
  go.append(again, menu);
  box.append(go);
  overlay.append(box);
  host.append(overlay);
  again.focus();
}
