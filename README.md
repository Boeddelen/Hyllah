# Retro Vault

> A quiet, private place for your music collection.
> Open source · EU-hosted · Free · Self-hostable.

---

## What this is

Retro Vault is a music collection manager for vinyl, CDs, cassettes, and other physical media.
It started as a single-file local-first HTML app and is being rebuilt as a multi-user web app
that anyone can sign up for — or self-host on their own server.

This repository contains the new SaaS version. The original single-file app lives in
`legacy/VinylVault.html` for reference.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend + Backend | SvelteKit 2 (Svelte 5) |
| Hosting | Cloudflare Pages (auto-deploys from this repo) |
| Database | Supabase (PostgreSQL, EU Zürich region) |
| Auth | Supabase Auth — magic-link email only |
| Storage | Supabase Storage (cover art) |
| Email | Resend (sends magic links from `noreply@retrovault.no`) |
| Analytics | Umami (privacy-first, no cookies) |

## Project structure

```
retrovault/
├── schema.sql                 ← Database schema — paste into Supabase SQL Editor
├── package.json               ← Dependencies (run `npm install`)
├── svelte.config.js           ← SvelteKit configuration
├── vite.config.js
├── jsconfig.json
├── .env.example               ← Copy to .env and fill in
├── .gitignore
├── src/
│   ├── app.html              ← HTML shell (fonts, meta tags)
│   ├── app.css               ← Global styles
│   ├── app.d.ts              ← TypeScript types
│   ├── hooks.server.js       ← Per-request auth setup
│   └── routes/
│       ├── +layout.js        ← Provides Supabase client to all pages
│       ├── +layout.server.js
│       ├── +layout.svelte
│       ├── +page.svelte      ← LANDING PAGE (retrovault.no)
│       ├── login/
│       │   └── +page.svelte  ← Magic-link login form
│       ├── auth/callback/
│       │   └── +server.js    ← Handles magic-link return
│       └── app/
│           ├── +page.server.js   ← Protected route guard
│           └── +page.svelte      ← Authenticated app (stub for now)
```

---

## Self-hosting

Coming soon — a Docker Compose file will be added so anyone can run their own Retro Vault
instance with one command.

---

## Contributing

Issues and PRs welcome. The code follows simple SvelteKit conventions.
Run `npm run format` before committing.

## License

MIT — do what you want with it.
