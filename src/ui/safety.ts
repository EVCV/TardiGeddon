// Report and Block for online play: on each other player in the room lobby,
// and in a match from the 👥 button. Reports go to our support team (the
// server emails them with the names the player typed); blocking hides that
// player's names from you and keeps them out of your quick-play matches.

import type { LobbySlot } from '../net/protocol';
import { BLOCKED_TEAM, block, isBlocked, unblock } from '../net/blocked';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const REPORT_REASONS: [string, string][] = [
  ['name', tk('Rude or unsafe name')],
  ['contact', tk('Sharing contact details or personal information')],
  ['cheating', tk('Cheating or spoiling the game')],
  ['other', tk('Something else')],
];

/** Can this slot be reported or blocked by the player in slot `you`? */
export function otherPlayer(s: LobbySlot, i: number, you: number): s is LobbySlot & { pid: string } {
  return !s.cpu && i !== you && !!s.pid;
}

/** The name to show for a slot: hidden if you blocked its player. */
export function slotName(s: LobbySlot): string {
  return isBlocked(s.pid) ? t(BLOCKED_TEAM) : s.team.name;
}

/** Ask why, then send the report. */
export function openReport(host: HTMLElement, name: string, send: (reason: string) => void, onBlock: () => void): void {
  const overlay = el('div', 'editor-overlay safety-overlay');
  const box = el('div', 'editor safety-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('Report a player'));
  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  box.append(el('h2', 'editor-title', t('⚑ Report')), el('p', 'account-note', t("What's wrong with “{name}”?", { name })));
  const reasons = el('div', 'safety-reasons');
  for (const [id, label] of REPORT_REASONS) {
    const b = el('button', 'hud-btn', t(label));
    b.onclick = () => {
      send(id);
      box.replaceChildren(
        el('h2', 'editor-title', t('Thanks')),
        el('p', 'account-note', t('Your report has gone to our team, who will look at it. Reports are private: the other player isn’t told who sent it.')),
      );
      const actions = el('div', 'editor-actions');
      if (!isBlockedName(name)) {
        const blockBtn = el('button', 'hud-btn', t('🚫 Block them too'));
        blockBtn.onclick = () => {
          onBlock();
          close();
        };
        actions.append(blockBtn);
      }
      const done = el('button', 'big-btn', t('Done'));
      done.onclick = close;
      actions.append(done);
      box.append(actions);
      done.focus();
    };
    reasons.append(b);
  }
  const cancel = el('button', 'hud-btn', t('Cancel'));
  cancel.onclick = close;
  box.append(reasons, cancel);
  overlay.append(box);
  host.append(overlay);
}

const isBlockedName = (name: string) => name === t(BLOCKED_TEAM);

/**
 * ⚑ Report and 🚫 Block (or Unblock) buttons for another player.
 * `onChange` runs after blocking or unblocking, to redraw names.
 */
export function playerActions(host: HTMLElement, s: LobbySlot & { pid: string }, report: (reason: string) => void, onChange: () => void): HTMLElement {
  const box = el('span', 'safety-actions');
  const blocked = isBlocked(s.pid);
  const doBlock = () => {
    block(s.pid, s.team.name);
    onChange();
  };
  const rep = el('button', 'slot-edit safety-btn', t('⚑ Report'));
  rep.title = t('Report this player');
  rep.setAttribute('aria-label', t('Report {name}', { name: slotName(s) }));
  rep.onclick = () => openReport(host, slotName(s), report, doBlock);
  const blk = el('button', 'slot-edit safety-btn', blocked ? t('↩ Unblock') : t('🚫 Block'));
  blk.title = blocked ? t('Unblock this player') : t('Block this player');
  blk.setAttribute('aria-label', blocked ? t('Unblock {name}', { name: slotName(s) }) : t('Block {name}', { name: slotName(s) }));
  blk.onclick = () => {
    if (blocked) {
      unblock(s.pid);
      onChange();
    } else if (confirm(t("Block {name}? You won't see their names, and you won't be put in quick-play matches with them.", { name: s.team.name }))) doBlock();
  };
  box.append(rep, blk);
  return box;
}

/** In a match: the other players, each with Report and Block. */
export function openPlayers(host: HTMLElement, slots: LobbySlot[], you: number, report: (idx: number, reason: string) => void, onChange: () => void): void {
  const overlay = el('div', 'editor-overlay safety-overlay');
  const box = el('div', 'editor safety-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('Players'));
  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const draw = () => {
    box.replaceChildren(el('h2', 'editor-title', t('👥 Players')));
    const list = el('div', 'lobby-slots');
    let any = false;
    slots.forEach((s, i) => {
      if (!otherPlayer(s, i, you)) return;
      any = true;
      const row = el('div', 'lobby-slot');
      row.append(el('span', 'lobby-name', slotName(s)), playerActions(host, s, (reason) => report(i, reason), () => {
        onChange();
        draw();
      }));
      list.append(row);
    });
    box.append(any ? list : el('p', 'account-note', t('No other players in this match.')));
    box.append(el('p', 'account-note', t('⚑ Report sends the player’s names to our team. 🚫 Block hides their names from you and keeps them out of your quick-play games. There is no chat in TardiGeddon.')));
    const done = el('button', 'big-btn', t('Close'));
    done.onclick = close;
    box.append(done);
  };
  draw();
  overlay.append(box);
  host.append(overlay);
}
