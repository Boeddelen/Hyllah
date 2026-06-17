# Hyllah — brand assets

The mark is the **arched shelf cabinet** — the letter **A** built as a niche
with two internal shelves. The name comes from *hylla* (Trondheim dialect for
"the shelf"), so the logo is literally built from shelves: every letter in the
wordmark is cut by one continuous horizontal shelf-slot, and the A is the
cabinet that the slot lives inside.

## Two treatments

| Treatment | Where it's used | Source |
|---|---|---|
| **Glass** (3D, photoreal) | App icon, Apple touch icon, PWA install icon, large hero/marketing | Rendered externally (Firefly / 3D). Raster PNG. |
| **Flat** (vector cabinet) | Browser tab favicon (16/32), in-app wordmark, anywhere it must stay legible small or print in one colour | `favicon.svg`, `hyllah-wordmark*.svg`. Pure SVG. |

Glass is the hero; flat is the working version. Don't try to render the whole
UI in glass — it stops reading below ~64px.

## Colour — one word, accent A

The wordmark is a single colour (the theme's `--ink`); **only the A** carries
the accent (`--accent`). `hyllah-wordmark.svg` is theme-agnostic:

```css
.brand-mark { color: var(--ink); }          /* the H Y L L _ H */
.brand-mark { --hyllah-accent: var(--accent); } /* the A */
```

Per-theme values (dark mode), pulled from `src/app.css`:

| Theme | ink | accent |
|---|---|---|
| listening-room | `#ede8dc` | `#cda84e` |
| neon-abyss | `#dce4ff` | `#ff2a6d` |
| black-frost | `#cfcfcf` | `#9a9a9a` |
| concrete | `#eaeaea` | `#e85d3a` |

## Files

`static/` (served at site root):
- `favicon.svg` — flat cabinet, scalable tab icon
- `favicon-16.png`, `favicon-32.png`, `favicon.ico` — crisp small fallbacks
- `apple-touch-icon.png` (180) — glass, concrete
- `icon-192.png`, `icon-512.png` — glass, concrete (PWA)
- `icon-dark-512.png` — glass, neutral/dark alternate
- `site.webmanifest`
- `hyllah-wordmark.svg` (themeable), `hyllah-wordmark-concrete.svg` (baked)

`brand/` (source art, not part of the served bundle):
- `hyllah-icon-glass-concrete.png`, `hyllah-icon-glass-dark.png` — full-res renders
- per-theme flat favicons + wordmarks, `hyllah-all-themes.png` preview

## Notes / follow-ups
- App-icon tiles keep the render's own rounded corner; a future full-bleed crop
  would let iOS do the rounding edge-to-edge if double-rounding ever shows.
- `site.webmanifest` `theme_color`/`background_color` are concrete dark
  (`#121214`); align with the canonical default theme when that's decided.
- Large PNGs are versioned here for convenience; move to Git LFS or an asset
  store if repo size becomes a concern.
