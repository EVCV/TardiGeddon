// Daily challenges in the game (src/challenge/daily.ts): pick today's Targets
// or Rope Race, and afterwards see your result, send it to the leaderboard
// (signed in) and see where you placed. The website shows the same boards.

import { CHALLENGE_KINDS, TARGET_COUNT, TARGET_TURNS, challengeDay, type ChallengeKind } from '../challenge/meta';
import type { ChallengeResult } from '../challenge/daily';
import { TICK_RATE } from '../sim/types';
import { account, challengeBoard, submitChallenge, type BoardRow } from '../account/session';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** English (the keys); shown with challengeTitle / challengeBlurb. */
export const CHALLENGE_INFO: Record<ChallengeKind, { title: string; blurb: string }> = {
  targets: {
    title: tk('🎯 Target Smash'),
    blurb: tk('Pop as many of the {count} targets as you can in {turns} turns. Everyone gets the same map, wind and targets today.'),
  },
  rope: {
    title: tk('🕸️ Rope Race'),
    blurb: tk('Today’s course: swing from the start to the flag. Your best of three tries counts.'),
  },
};

export function challengeTitle(kind: ChallengeKind): string {
  return t(CHALLENGE_INFO[kind].title);
}

export function challengeBlurb(kind: ChallengeKind): string {
  return t(CHALLENGE_INFO[kind].blurb, { count: TARGET_COUNT, turns: TARGET_TURNS });
}

/** How a result reads: "6 / 8 targets in 182.4s", "41.36s". */
export function resultText(kind: ChallengeKind, value: number, ticks: number): string {
  if (kind === 'rope') return value < 0 ? t('No finish') : t('{s}s', { s: (value / TICK_RATE).toFixed(2) });
  return t('{n} / {total} targets in {s}s', { n: value, total: TARGET_COUNT, s: (ticks / TICK_RATE).toFixed(1) });
}

/** A leaderboard list. */
export function boardList(kind: ChallengeKind, rows: BoardRow[], me: BoardRow | null): HTMLElement {
  const ol = el('ol', 'board');
  if (!rows.length) ol.append(el('li', 'board-empty', t('Nobody yet today: be the first!')));
  for (const r of rows) {
    const li = el('li', r.you ? 'you' : '');
    li.append(el('span', 'board-rank', `${r.rank}`), el('span', 'board-name', r.name), el('span', 'board-value', resultText(kind, r.value, r.ticks)));
    ol.append(li);
  }
  if (me && !rows.some((r) => r.you)) {
    const li = el('li', 'you');
    li.append(el('span', 'board-rank', `${me.rank}`), el('span', 'board-name', t('{name} (you)', { name: me.name })), el('span', 'board-value', resultText(kind, me.value, me.ticks)));
    ol.append(li);
  }
  return ol;
}

/** The chooser: today's two challenges, each with its top three. */
export function chooseChallenge(host: HTMLElement, onPick: (kind: ChallengeKind) => void): void {
  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor practice-choice');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('Daily challenge'));
  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  box.append(el('h2', 'editor-title', t('🏆 Daily challenge')), el('p', 'account-note', account().me?.user ? t('New every day at midnight (UTC). Your best run goes on the leaderboard.') : t('New every day at midnight (UTC). Sign in to put your score on the leaderboard.')));
  const day = challengeDay();
  for (const kind of CHALLENGE_KINDS) {
    const b = el('button', 'practice-option');
    b.append(el('b', '', challengeTitle(kind)), el('span', '', challengeBlurb(kind)));
    const top = el('span', 'board-top');
    b.append(top);
    b.onclick = () => {
      close();
      onPick(kind);
    };
    box.append(b);
    if (account().me) {
      void challengeBoard(kind, day).then((r) => {
        if (r?.rows.length) top.textContent = t('🥇 {name}: {result}', { name: r.rows[0].name, result: resultText(kind, r.rows[0].value, r.rows[0].ticks) });
      });
    }
  }
  const cancel = el('button', 'hud-btn', t('Cancel'));
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
  /** How Fire charged throws in this run (the server plays it back the same way). */
  charge: string,
  onAgain: () => void,
  onMenu: () => void,
): void {
  const overlay = el('div', 'overlay');
  const box = el('div', 'overlay-box gameover-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('Challenge result'));
  box.append(el('h1', 'title-small', challengeTitle(kind)), el('p', 'challenge-result', resultText(kind, result.value, result.ticks)));
  const status = el('p', 'account-note');
  status.setAttribute('role', 'status');
  const boardBox = el('div', 'gameover-stats');
  box.append(status, boardBox);
  const showBoard = async () => {
    const b = await challengeBoard(kind, day);
    boardBox.replaceChildren(el('h2', 'card-title', t('Today’s leaderboard')), b ? boardList(kind, b.rows.slice(0, 10), b.me) : el('p', 'account-note', t('The leaderboard can’t be reached right now.')));
  };
  if (!account().me?.user) {
    status.textContent = t('Sign in (Account in the menu) to put your score on the leaderboard.');
    if (account().me) void showBoard();
  } else {
    status.textContent = t('Checking your run…');
    submitChallenge(kind, day, packed, charge).then(
      (r) => {
        status.textContent = r.me ? t('You’re number {rank} today!', { rank: r.me.rank }) : t('Sent.');
        void showBoard();
      },
      (e: Error) => {
        status.textContent = t(e.message);
        void showBoard();
      },
    );
  }
  const go = el('div', 'gameover-go');
  const again = el('button', 'big-btn', t('Try again'));
  again.onclick = onAgain;
  const menu = el('button', 'big-btn secondary', t('Main menu'));
  menu.onclick = onMenu;
  go.append(again, menu);
  box.append(go);
  overlay.append(box);
  host.append(overlay);
  again.focus();
}
