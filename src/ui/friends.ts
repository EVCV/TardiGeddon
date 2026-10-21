// Friends on the online screen (server/friends.ts): your friend code, adding
// a friend by theirs, answering requests, and your friends with who's online
// (join their room, or invite them to yours). No chat. Signed in only.

import { addFriend, friendsList, inviteFriend, removeFriend, type Friend, type FriendLists } from '../account/session';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const ADD_TEXT: Record<string, string> = {
  asked: tk('Request sent: they’ll see it next time they open Play online.'),
  friends: tk('You’re friends now!'),
  self: tk('That’s your own code.'),
  unknown: tk('No player has that code.'),
  full: tk('Your friends list is full.'),
};

/**
 * The panel. `inRoom`: you're in a room's lobby, so friends get an Invite
 * button. `onJoin` joins a friend's room by its code. Refreshes itself
 * every few seconds while it's on screen.
 */
export function friendsPanel(opts: { inRoom: boolean; onJoin: (code: string) => void }): HTMLElement {
  const box = el('section', 'friends');
  box.setAttribute('aria-label', t('Friends'));
  const note = el('p', 'online-note');
  note.setAttribute('role', 'status');
  let lists: FriendLists | null = null;

  const draw = () => {
    box.replaceChildren(el('h2', 'card-title', t('👥 Friends')));
    if (!lists) {
      box.append(el('p', 'online-note', t('Loading…')));
      return;
    }
    const mine = el('p', 'friend-code');
    const copy = el('button', 'hud-btn', t('Your code: {code} 📋', { code: lists.code }));
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(lists!.code);
        note.textContent = t('Code copied. Give it to a friend so they can add you.');
      } catch {
        note.textContent = t('Your code is {code}.', { code: lists!.code });
      }
    };
    mine.append(copy);
    const add = el('div', 'join-row');
    const input = el('input', 'code-input');
    input.placeholder = t('Friend’s code');
    input.maxLength = 9;
    input.autocapitalize = 'characters';
    input.setAttribute('aria-label', t('Friend’s code'));
    const go = el('button', 'hud-btn', t('Add'));
    go.onclick = async () => {
      try {
        const r = await addFriend(input.value);
        note.textContent = t(ADD_TEXT[r.result]);
        input.value = '';
        await refresh();
      } catch (e) {
        note.textContent = e instanceof Error ? t(e.message) : String(e);
      }
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') go.click();
    };
    add.append(input, go);
    box.append(mine, add, note);

    const row = (f: Friend, ...buttons: HTMLElement[]) => {
      const r = el('div', 'friend-row');
      const dot = el('span', 'friend-dot' + (f.online ? ' on' : ''));
      dot.setAttribute('aria-label', f.online ? t('Online') : t('Offline'));
      r.append(dot, el('span', 'friend-name', f.name), ...buttons); // names: never innerHTML
      return r;
    };
    const button = (text: string, label: string, fn: () => Promise<unknown>) => {
      const b = el('button', 'hud-btn', text);
      b.setAttribute('aria-label', label);
      b.onclick = async () => {
        b.disabled = true;
        try {
          await fn();
        } catch (e) {
          note.textContent = e instanceof Error ? t(e.message) : String(e);
        }
        b.disabled = false;
      };
      return b;
    };
    for (const f of lists.requests) {
      box.append(
        row(
          { ...f, online: false },
          el('span', 'online-note', t('wants to be friends')),
          button('✓', t('Accept {name}', { name: f.name }), async () => {
            await addFriend(f.code);
            await refresh();
          }),
          button('✕', t('Decline {name}', { name: f.name }), async () => {
            await removeFriend(f.code);
            await refresh();
          }),
        ),
      );
    }
    for (const f of lists.friends) {
      const buttons: HTMLElement[] = [];
      if (f.room) buttons.push(button(t('Join'), t('Join {name}’s room', { name: f.name }), async () => opts.onJoin(f.room!)));
      if (opts.inRoom && f.online) {
        buttons.push(
          button(t('Invite'), t('Invite {name}', { name: f.name }), async () => {
            const r = await inviteFriend(f.code);
            note.textContent = r.result === 'sent' ? t('Invite sent to {name}.', { name: f.name }) : r.result === 'offline' ? t('{name} isn’t on Play online right now.', { name: f.name }) : t('Invites work from a private room’s lobby.');
          }),
        );
      }
      buttons.push(
        button('✕', t('Remove {name}', { name: f.name }), async () => {
          if (!confirm(t('Remove {name} from your friends?', { name: f.name }))) return;
          await removeFriend(f.code);
          await refresh();
        }),
      );
      box.append(row(f, ...buttons));
    }
    for (const f of lists.sent) box.append(row({ ...f, online: false }, el('span', 'online-note', t('asked')), button('✕', t('Cancel request to {name}', { name: f.name }), async () => {
      await removeFriend(f.code);
      await refresh();
    })));
    if (!lists.friends.length && !lists.requests.length && !lists.sent.length) {
      box.append(el('p', 'online-note', t('Swap codes with a friend to play together. Only friends who both said yes see each other online.')));
    }
  };

  const refresh = async () => {
    try {
      lists = await friendsList();
    } catch {
      /* keep what we had */
    }
    if (box.isConnected || !lists) draw();
  };
  draw();
  void refresh();
  const timer = window.setInterval(() => {
    if (!box.isConnected) window.clearInterval(timer);
    else void refresh();
  }, 8000);
  return box;
}

/** A friend's invite, shown over everything with a Join button. */
export function showInvite(from: string, onJoin: () => void): void {
  // On the page itself, not inside a screen that may let clicks through.
  const host = document.body;
  host.querySelector('.invite-toast')?.remove();
  const toast = el('div', 'invite-toast');
  toast.setAttribute('role', 'alert');
  const join = el('button', 'big-btn', t('Join'));
  const no = el('button', 'hud-btn', t('Not now'));
  join.onclick = () => {
    toast.remove();
    onJoin();
  };
  no.onclick = () => toast.remove();
  toast.append(el('span', '', t('🎉 {name} invites you to play!', { name: from })), join, no);
  host.append(toast);
  setTimeout(() => toast.remove(), 30_000);
}
