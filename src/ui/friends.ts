// Friends on the online screen (server/friends.ts): your friend code, adding
// a friend by theirs, answering requests, and your friends with who's online
// (join their room, or invite them to yours). No chat. Signed in only.

import { addFriend, friendsList, inviteFriend, removeFriend, type Friend, type FriendLists } from '../account/session';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const ADD_TEXT: Record<string, string> = {
  asked: 'Request sent: they’ll see it next time they open Play online.',
  friends: 'You’re friends now!',
  self: 'That’s your own code.',
  unknown: 'No player has that code.',
  full: 'Your friends list is full.',
};

/**
 * The panel. `inRoom`: you're in a room's lobby, so friends get an Invite
 * button. `onJoin` joins a friend's room by its code. Refreshes itself
 * every few seconds while it's on screen.
 */
export function friendsPanel(opts: { inRoom: boolean; onJoin: (code: string) => void }): HTMLElement {
  const box = el('section', 'friends');
  box.setAttribute('aria-label', 'Friends');
  const note = el('p', 'online-note');
  note.setAttribute('role', 'status');
  let lists: FriendLists | null = null;

  const draw = () => {
    box.replaceChildren(el('h2', 'card-title', '👥 Friends'));
    if (!lists) {
      box.append(el('p', 'online-note', 'Loading…'));
      return;
    }
    const mine = el('p', 'friend-code');
    const copy = el('button', 'hud-btn', `Your code: ${lists.code} 📋`);
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(lists!.code);
        note.textContent = 'Code copied. Give it to a friend so they can add you.';
      } catch {
        note.textContent = `Your code is ${lists!.code}.`;
      }
    };
    mine.append(copy);
    const add = el('div', 'join-row');
    const input = el('input', 'code-input');
    input.placeholder = 'Friend’s code';
    input.maxLength = 9;
    input.autocapitalize = 'characters';
    input.setAttribute('aria-label', 'Friend’s code');
    const go = el('button', 'hud-btn', 'Add');
    go.onclick = async () => {
      try {
        const r = await addFriend(input.value);
        note.textContent = ADD_TEXT[r.result];
        input.value = '';
        await refresh();
      } catch (e) {
        note.textContent = e instanceof Error ? e.message : String(e);
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
      dot.setAttribute('aria-label', f.online ? 'Online' : 'Offline');
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
          note.textContent = e instanceof Error ? e.message : String(e);
        }
        b.disabled = false;
      };
      return b;
    };
    for (const f of lists.requests) {
      box.append(
        row(
          { ...f, online: false },
          el('span', 'online-note', 'wants to be friends'),
          button('✓', `Accept ${f.name}`, async () => {
            await addFriend(f.code);
            await refresh();
          }),
          button('✕', `Decline ${f.name}`, async () => {
            await removeFriend(f.code);
            await refresh();
          }),
        ),
      );
    }
    for (const f of lists.friends) {
      const buttons: HTMLElement[] = [];
      if (f.room) buttons.push(button('Join', `Join ${f.name}’s room`, async () => opts.onJoin(f.room!)));
      if (opts.inRoom && f.online) {
        buttons.push(
          button('Invite', `Invite ${f.name}`, async () => {
            const r = await inviteFriend(f.code);
            note.textContent = r.result === 'sent' ? `Invite sent to ${f.name}.` : r.result === 'offline' ? `${f.name} isn’t on Play online right now.` : 'Invites work from a private room’s lobby.';
          }),
        );
      }
      buttons.push(
        button('✕', `Remove ${f.name}`, async () => {
          if (!confirm(`Remove ${f.name} from your friends?`)) return;
          await removeFriend(f.code);
          await refresh();
        }),
      );
      box.append(row(f, ...buttons));
    }
    for (const f of lists.sent) box.append(row({ ...f, online: false }, el('span', 'online-note', 'asked'), button('✕', `Cancel request to ${f.name}`, async () => {
      await removeFriend(f.code);
      await refresh();
    })));
    if (!lists.friends.length && !lists.requests.length && !lists.sent.length) {
      box.append(el('p', 'online-note', 'Swap codes with a friend to play together. Only friends who both said yes see each other online.'));
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
  const t = el('div', 'invite-toast');
  t.setAttribute('role', 'alert');
  const join = el('button', 'big-btn', 'Join');
  const no = el('button', 'hud-btn', 'Not now');
  join.onclick = () => {
    t.remove();
    onJoin();
  };
  no.onclick = () => t.remove();
  t.append(el('span', '', `🎉 ${from} invites you to play!`), join, no);
  host.append(t);
  setTimeout(() => t.remove(), 30_000);
}
