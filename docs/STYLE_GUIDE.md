# TardiGeddon Style Guide

**Look: vector cartoon.** Bold dark outlines, flat colours, one level of soft
shading, chunky readable shapes that work at phone size.

## Palette (source of truth: `src/render/palette.ts`)

| Use                | Colour    |
| ------------------ | --------- |
| Outline / ink      | `#2b1b24` |
| Tardi body         | `#f6c9ab` |
| Tardi shade        | `#e3a98a` |
| Tardi mouth        | `#e58b86` |
| Sky (top → bottom) | `#7fd3f7` → `#d9f3ff` |
| Moss (dark/mid/light) | `#2e5a1c` / `#5aa83a` / `#8fdb5f` |
| Soil (edge/base/pebble/light) | `#3b2416` / `#9c6438` / `#7f4d29` / `#b57d4c` |
| Water              | `#2f86d6` / `#7cc4ff` |
| UI paper           | `#fff8ec` |
| UI accent          | `#ffd84a` |
| Team colours       | `#e04848` `#3a7be0` `#3cb34a` `#e0a020` |

## Rules

- Outlines: 1.2–1.6 px at 1× for sprites, 3 px for UI panels; colour is always the ink colour.
- Lighting from the top-left; highlights are small white dots/arcs.
- The tardi is built from layers (back legs → body → shading → creases → mouth → eyes →
  hat → front legs). Cosmetics are extra layers on this rig, never a redraw.
- Fonts: **Luckiest Guy** (titles, names, numbers) and **Nunito** (body/UI), both bundled.
- UI: rounded panels (10–24 px radius), ink border, solid "drop" shadow offset downward.

## AI-generated assets

Painted backgrounds/key art from image generators must start from the master
prompt below and be saved with a sibling `*.prompt.txt`.

> Master prompt: "Flat vector cartoon illustration, bold dark-plum outlines
> (#2b1b24), bright saturated colours, simple cel shading, lit from top-left,
> microscopic world seen at giant scale (moss fronds, water droplets, sand grains),
> playful, clean shapes, no text, no characters, game background, 16:9."
