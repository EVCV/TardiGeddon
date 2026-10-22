// The texts that live in data files rather than in t('…') calls: shown with
// t(x.name) / t(x.blurb). scripts/i18n.ts and tests/i18n.test.ts add these to
// the keys found in code. Team and tardigrade names are names: not translated.

import { WEAPONS } from '../sim/weapons';
import { SCHEME_PRESETS } from '../sim/schemes';
import { MAP_STYLES } from '../sim/terrain/generate';
import { CPU_SKILLS } from '../ai/skills';
import { TIERS } from '../stats/rank';
import { ARENAS } from '../render/arenas';
import { AIM_STYLES, FX_STYLES } from '../render/cosmetics';
import { DANCES, GRAVES } from '../render/finales';
import { HATS } from '../render/hats';
import { SEASONS } from '../render/seasons';
import { SKINS } from '../render/skins';
import { WEATHER_NAMES } from '../render/weather';
import { BUNDLES, GIFT_MESSAGES, PROMO_ITEMS, SHOP_ITEMS } from '../shop/catalog';
import { EGGS } from '../eggs';
import { TRACKS } from '../audio/music';

export function DATA_KEYS(): string[] {
  const named: { name: string; blurb?: string }[] = [
    ...Object.values(WEAPONS),
    ...SCHEME_PRESETS,
    ...MAP_STYLES,
    ...CPU_SKILLS,
    ...TIERS,
    ...ARENAS,
    ...AIM_STYLES,
    ...FX_STYLES,
    ...DANCES,
    ...GRAVES,
    ...HATS,
    ...SEASONS,
    ...SKINS,
    ...SHOP_ITEMS,
    ...PROMO_ITEMS,
    ...BUNDLES,
    ...TRACKS,
  ];
  return [
    ...named.flatMap((x) => [x.name, x.blurb ?? '']),
    ...Object.values(WEATHER_NAMES),
    ...Object.values(GIFT_MESSAGES),
    ...EGGS.flatMap((e) => [e.name, e.riddle]),
    'Custom map',
  ].filter((s) => s);
}
