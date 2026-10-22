// Sharing a match result: a short message and a picture card of the
// end-of-match numbers. Uses the device's share sheet where there is one;
// otherwise copies the message and saves the picture.

import type { WorldState } from '../sim/types';
import type { TeamTally } from '../stats/tally';
import { mapStyleName } from '../sim/terrain/generate';
import { hex, shown } from '../render/palette';
import { EMBLEM_ICONS, parseEmblem } from '../render/emblems';
import { teamLabel } from '../net/blocked';
import { t } from '../i18n/i18n';

const SITE = 'https://tardigeddon.com';

/** The message: who won, where, and the winner's best numbers. */
export function shareText(s: WorldState, stats: readonly TeamTally[]): string {
  const w = s.turn.winner;
  const where = t(mapStyleName(s.realm));
  if (w < 0) return t('A draw on {map} in TardiGeddon! Tiny. Indestructible. Armed. {site}', { map: where, site: SITE });
  const tally = stats[w];
  const bits = [t('{n} damage', { n: tally.damage }), t('{n} popped', { n: tally.popped })];
  if (tally.bestTurn > 0) bits.push(t('best turn {n}', { n: tally.bestTurn }));
  return t('{team} won on {map} in TardiGeddon! {numbers}. {site}', { team: teamLabel(s.teams[w]), map: where, numbers: bits.join(' · '), site: SITE });
}

/** A 1200x630 picture of the results (the size link previews use). */
export function shareCard(s: WorldState, stats: readonly TeamTally[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 630;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 630);
  sky.addColorStop(0, '#7fd3f7');
  sky.addColorStop(1, '#d9f3ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = '#fff8ec';
  g.strokeStyle = '#2b1b24';
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(40, 40, 1120, 550, 36);
  g.fill();
  g.stroke();

  const w = s.turn.winner;
  g.textAlign = 'center';
  g.fillStyle = w >= 0 ? hex(shown(s.teams[w].color)) : '#2b1b24';
  g.font = '64px "Luckiest Guy", "Arial Black", sans-serif';
  g.lineWidth = 10;
  g.strokeStyle = '#2b1b24';
  const title = w >= 0 ? t('{team} wins!', { team: teamLabel(s.teams[w]) }) : t('Draw!');
  g.strokeText(title, 600, 130, 1040);
  g.fillText(title, 600, 130, 1040);
  g.fillStyle = '#2b1b24';
  g.font = '800 28px Nunito, system-ui, sans-serif';
  g.fillText(t('{map} · {n} turns', { map: t(mapStyleName(s.realm)), n: Math.max(1, s.turn.turnNumber) }), 600, 175);

  // A row per team (up to six), winner first.
  const order = s.teams.map((team) => team.id).sort((a, b) => (a === w ? -1 : b === w ? 1 : stats[b].damage - stats[a].damage)).slice(0, 6);
  const top = 220;
  const rowH = Math.min(58, 330 / order.length);
  g.font = '800 22px Nunito, system-ui, sans-serif';
  g.textAlign = 'right';
  const cols: [string, number][] = [[t('Damage'), 760], [t('Popped'), 880], [t('Best turn'), 1010], [t('Shots'), 1110]];
  for (const [label, x] of cols) g.fillText(label, x, top);
  order.forEach((id, i) => {
    const team = s.teams[id];
    const st = stats[id];
    const y = top + 20 + (i + 1) * rowH - rowH / 3;
    g.textAlign = 'left';
    g.fillStyle = hex(shown(team.color));
    g.fillRect(80, y - rowH / 2, 14, rowH * 0.8);
    const e = parseEmblem(team.emblem);
    g.font = `${Math.round(rowH * 0.55)}px sans-serif`;
    g.fillStyle = '#2b1b24';
    if (e) g.fillText(EMBLEM_ICONS[e.icon], 106, y + rowH * 0.18);
    g.font = `800 ${Math.round(rowH * 0.48)}px Nunito, system-ui, sans-serif`;
    g.fillText(teamLabel(team) + (id === w ? '  🏆' : ''), 150, y + rowH * 0.15, 460);
    g.textAlign = 'right';
    [st.damage, st.popped, st.bestTurn, st.shots].forEach((v, k) => g.fillText(String(v), cols[k][1], y + rowH * 0.15));
  });
  g.textAlign = 'center';
  g.font = '28px "Luckiest Guy", "Arial Black", sans-serif';
  g.fillStyle = '#2b1b24';
  g.fillText('TARDIGEDDON · tardigeddon.com', 600, 565);
  return c;
}

/** Share the result. Resolves to what happened, for a short note under the button. */
export async function shareMatch(s: WorldState, stats: readonly TeamTally[]): Promise<'shared' | 'copied' | 'saved' | 'cancelled'> {
  const text = shareText(s, stats);
  const blob = await new Promise<Blob | null>((ok) => shareCard(s, stats).toBlob(ok, 'image/png'));
  const file = blob ? new File([blob], 'tardigeddon-result.png', { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ text, files: [file] });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'cancelled';
  }
  // No share sheet: copy the message, and save the picture.
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked: the picture still saves */
  }
  if (blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tardigeddon-result.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return 'saved';
  }
  return 'copied';
}
