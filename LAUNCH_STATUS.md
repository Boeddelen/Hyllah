# Hyllah Launch Status

**Target:** ~17–24 Nov 2026 · **Updated:** 2026-06-25

Legend: `✅ done` · `🔄 in progress` · `⏳ pending` · `⛔ blocked`

---

## Phase A ★ — Foundation Fixes
_Weeks 1–4 · Jun 23 – Jul 20_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | DMs (inbox + thread) | ⏳ | |
| 2 | Block + Report | ⏳ | |
| 3 | New /signup page | ⏳ | |
| 4 | Post-login routing (new vs returning) | ⏳ | |
| 5 | Copy/text audit | ⏳ | |
| 6 | Rewrite landing page copy | ⏳ | |
| 7 | Update Terms of Service | ⏳ | |
| 8 | Update Privacy Policy (flag E2E gap) | ⏳ | |

---

## Phase B ★ — Security Audit & Fixes
_Weeks 3–6 · Jul 14 – Aug 4_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | is_admin privilege escalation audit | ⏳ | P0 |
| 2 | Cache privacy window fix | ⏳ | |
| 3 | CSP + security headers | ⏳ | |
| 4 | rel="noopener noreferrer" audit | ⏳ | |
| 5 | exchange_rates RLS write path | ⏳ | |
| 6 | Svelte state_referenced_locally warnings | ⏳ | |
| 7 | Drop legacy records.collection_id column | ⏳ | |
| 8 | External security review (optional) | ⏳ | |

---

## Phase C — Legal & Business (parallel)
_Weeks 1–11 · Jun 23 – Sep 8_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Register ENK | ⏳ | Do this week |
| 2 | Set GitHub repo to private | ⏳ | |
| 3 | Sign DPA — Supabase | ⏳ | |
| 4 | Sign DPA — Cloudflare | ⏳ | |
| 5 | Breach notification process | ⏳ | |
| 6 | Domain migration retrovault.no → hyllah.com | ⏳ | |
| 7 | Update ToS with subscription terms | ⏳ | After Paddle |

---

## Phase D ★ — Multi-Media Schema Migration
_Weeks 6–9 · Aug 4 – Aug 25_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Verify MusicBrainz integration | ⏳ | |
| 2 | Design + test migration SQL | ⏳ | |
| 3 | Run migration on production | ⏳ | ⚠ most dangerous op |
| 4 | Update all queries to be type-aware | ⏳ | |
| 5 | Expand setup wizard for multi-media | ⏳ | |

---

## Phase E — New Media Types
_Weeks 9–19 · Aug 25 – Nov 3_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Books (Open Library + Google Books) | ⏳ | |
| 2 | Films (TMDB) | ⏳ | |
| 3 | Trading cards — Pokémon TCG | ⏳ | |
| 4 | Trading cards — Magic: The Gathering | ⏳ | |

---

## Phase F ★ — Pricing Pipeline Rebuild
_Weeks 6–14 · Aug 4 – Sep 29_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Provision Hetzner VPS | ⏳ | Start asap |
| 2 | Build Discogs fetch service | ⏳ | |
| 3 | Build server-side price cache | ⏳ | |
| 4 | Wire stale-refresh logic | ⏳ | |
| 5 | Acceptance test at scale | ⏳ | 50–100 real records |

---

## Phase G ★ — Monetisation
_Weeks 14–19 · Sep 29 – Nov 3_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Badge system — DB + server-side evaluation | ⏳ | |
| 2 | Badge display | ⏳ | |
| 3 | Free/Pro gating in app | ⏳ | Server-side only |
| 4 | Integrate Paddle | ⏳ | |
| 5 | Set subscription price | ⏳ | ⚠ human decision |
| 6 | Domain finalisation + SEO | ⏳ | |

---

## Phase H ★ — Pre-Launch QA
_Weeks 19–21 · Nov 3 – Nov 17_

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Full new-user journey | ⏳ | |
| 2 | Pro feature validation | ⏳ | |
| 3 | Mobile smoke test | ⏳ | iOS Safari + Android Chrome |
| 4 | Legal final review | ⏳ | |
| 5 | Performance baseline | ⏳ | Lighthouse |
| 6 | Go / no-go decision | ⏳ | |

---

## 🚀 LAUNCH — ~17–24 Nov 2026

---

## Phase I — E2E Encryption for DMs (post-launch)
_~4–6 weeks · Start date TBD after launch stabilisation_

> **Known gap:** DMs are plaintext at launch. Flagged in Privacy Policy (Phase A, task 8).
> Gate: scope session required before starting.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Scope session — multi-device UX, schema plan | ⏳ | Gate for entire phase |
| 2 | Client-side key generation (Web Crypto API) | ⏳ | |
| 3 | Public key exchange + Supabase storage | ⏳ | |
| 4 | Message schema migration (plaintext → ciphertext) | ⏳ | Breaking change |
| 5 | Encrypt on send, decrypt on receive in browser | ⏳ | |
| 6 | Multi-device key export/import flow | ⏳ | Hardest UX problem |
| 7 | Update Privacy Policy — remove known gap flag | ⏳ | |
