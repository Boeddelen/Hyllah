# Retro Vault

> A quiet, private place for your music collection.
> Open source · EU-hosted · Free forever · Self-hostable.

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

## Setup (one time)

### 1. Clone and install

```bash
git clone https://github.com/Boeddelen/RetroVault.git
cd RetroVault
npm install
```

### 2. Run the database schema

1. Open your Supabase project dashboard
2. Go to **SQL Editor** → **New query**
3. Open `schema.sql` from this repo
4. Copy the entire contents and paste into the SQL editor
5. Click **Run**

You should see "Success. No rows returned." Verify the tables exist:
**Database → Tables**. You should see `users`, `collections`, `records`, `tracks`,
`custom_fields`, `tip_jar_clicks`.

### 3. Create the storage bucket for cover art

1. In Supabase, go to **Storage** → **New bucket**
2. Name: `covers`
3. Public: ✅ yes
4. Click **Create bucket**
5. Click on the new bucket → **Policies** tab
6. Add these four policies (click "New policy" → "From scratch"):

```sql
-- Policy 1: Users can upload to their own folder
CREATE POLICY "covers_user_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy 2: Users can update their own files
CREATE POLICY "covers_user_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy 3: Users can delete their own files
CREATE POLICY "covers_user_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy 4: Anyone can view (since covers are public on profiles)
CREATE POLICY "covers_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'covers');
```

### 4. Configure auth email templates (optional but recommended)

In Supabase → **Authentication** → **Email Templates**:

1. Click **Magic Link** template
2. Customize the subject to: `Sign in to Retro Vault`
3. Customize the body — leave the `{{ .ConfirmationURL }}` placeholder intact
4. Save

For production, also configure **Authentication → URL Configuration**:

- **Site URL:** `https://retrovault.no`
- **Redirect URLs:** add both `https://retrovault.no/**` and `http://localhost:5173/**`

### 5. Connect Resend for email delivery (recommended)

By default Supabase sends from `noreply@mail.app.supabase.io` which works but looks
generic. To send from `noreply@retrovault.no`:

1. In Supabase → **Project Settings** → **Authentication** → **SMTP Settings**
2. Enable custom SMTP
3. Fill in Resend's SMTP details (from resend.com → SMTP)
4. **From email:** `noreply@retrovault.no`
5. **From name:** `Retro Vault`
6. Save

### 6. Create your local `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in:

- `PUBLIC_SUPABASE_URL` — from Supabase → Settings → API
- `PUBLIC_SUPABASE_ANON_KEY` — from Supabase → Settings → API (the anon/public key)
- `SUPABASE_SERVICE_ROLE_KEY` — from same place (the service_role key — never commit)
- `RESEND_API_KEY` — from Resend → API Keys (optional for now)
- `PUBLIC_APP_URL` — leave as `http://localhost:5173` for local dev
- `PUBLIC_PAYPAL_ME_LINK` — your PayPal.me URL for the tip jar

### 7. Run it locally

```bash
npm run dev
```

Open http://localhost:5173 — you should see the landing page.
Click "Sign in with email", enter your address, check your inbox for the magic link.

---

## Deploying to retrovault.no

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial scaffold"
git push origin main
```

### 2. Connect Cloudflare Pages

1. Go to dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Authorize Cloudflare to access your GitHub
3. Select the `RetroVault` repo
4. **Project name:** `retrovault`
5. **Production branch:** `main`
6. **Framework preset:** SvelteKit
7. **Build command:** `npm run build`
8. **Build output directory:** `.svelte-kit/cloudflare`
9. Click **Save and Deploy**

### 3. Set environment variables on Cloudflare

In Cloudflare Pages → your project → **Settings** → **Environment Variables**:

Add the same values as your `.env` file. Production needs:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (mark as encrypted)
- `RESEND_API_KEY` (mark as encrypted)
- `PUBLIC_APP_URL` → `https://retrovault.no`
- `PUBLIC_PAYPAL_ME_LINK`
- `PUBLIC_UMAMI_WEBSITE_ID` (when you have one)

Redeploy after adding variables.

### 4. Attach your custom domain

1. Cloudflare Pages → your project → **Custom domains** → **Set up a custom domain**
2. Enter `retrovault.no`
3. Cloudflare auto-configures the DNS since you already moved your nameservers
4. Wait ~1 minute, then visit https://retrovault.no

Done. The site auto-deploys on every push to `main`.

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
