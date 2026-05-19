<script>
  // NOTE: We do NOT import enhance here.
  // The connect form must NOT use enhance — enhance intercepts redirects
  // client-side via fetch, which cannot follow an external redirect to
  // discogs.com. Plain form POST lets the browser handle the redirect natively.

  import { onMount, onDestroy } from 'svelte';
  import { getTheme, setTheme } from '$lib/theme.js';
  import { SUPPORTED_CURRENCIES, CURRENCY_LABELS } from '$lib/currency.js';

  let { data } = $props();

  const CARD_BACK_OPTIONS = [
    { value: 'details',   label: 'Album details',  hint: 'Format, year, label, condition, notes…' },
    { value: 'tracklist', label: 'Tracklist',      hint: 'Just the tracks.' },
    { value: 'both',      label: 'Both',           hint: 'Details first, then tracklist below.' }
  ];

  let cardBackView = $state(data.profile?.card_back_view ?? 'details');
  let savingPrefs = $state(false);

  // ── Profile state ──────────────────────────────────────
  let username       = $state(data.profile?.username ?? '');
  let displayName    = $state(data.profile?.display_name ?? '');
  let bio            = $state(data.profile?.bio ?? '');
  let displayCurrency = $state(data.profile?.display_currency ?? 'EUR');
  let isPublic        = $state(data.profile?.is_public ?? false);
  let showValuesPublicly = $state(data.profile?.show_values_publicly ?? false);
  let savingProfile = $state(false);

  // Username availability check (debounced)
  let usernameStatus = $state('idle');   // 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'format'
  let usernameDebounce;

  function onUsernameInput() {
    // Normalize as the user types — keep what they see in sync with what we'll save
    username = username.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    clearTimeout(usernameDebounce);
    // Empty username is fine (clearing your username) — don't fire a check
    if (!username) {
      usernameStatus = 'idle';
      return;
    }
    // If it's their existing username, no need to check
    if (username === (data.profile?.username ?? '')) {
      usernameStatus = 'available';
      return;
    }
    usernameStatus = 'checking';
    usernameDebounce = setTimeout(checkUsername, 350);
  }

  async function checkUsername() {
    try {
      const res = await fetch(`/api/username-available?u=${encodeURIComponent(username)}`);
      if (!res.ok) {
        usernameStatus = 'idle';
        return;
      }
      const body = await res.json();
      if (body.available) usernameStatus = 'available';
      else if (body.reason === 'taken') usernameStatus = 'taken';
      else if (body.reason === 'reserved') usernameStatus = 'reserved';
      else usernameStatus = 'format';
    } catch {
      usernameStatus = 'idle';
    }
  }

  onDestroy(() => clearTimeout(usernameDebounce));

  // Theme state — initialized after mount so SSR doesn't see the wrong value
  let currentTheme = $state('dark');
  onMount(() => {
    currentTheme = getTheme();
    // Trigger initial check so the indicator is right on first load
    if (username) onUsernameInput();
  });
  function switchTheme(t) {
    currentTheme = t;
    setTheme(t);
  }

  let banner = $derived.by(() => {
    if (data.profileStatus === 'saved') {
      return { tone: 'success', text: 'Profile saved.' };
    }
    if (data.profileStatus === 'error') {
      return { tone: 'error', text: data.profileError || 'Could not save profile.' };
    }
    if (data.prefsStatus === 'saved') {
      return { tone: 'success', text: 'Preferences saved.' };
    }
    if (data.prefsStatus === 'error') {
      return { tone: 'error', text: 'Could not save preferences.' };
    }
    switch (data.discogsStatus) {
      case 'connected':
        return {
          tone: 'success',
          text: data.profile?.discogs_username
            ? `Connected to Discogs as ${data.profile.discogs_username}.`
            : 'Connected to Discogs.'
        };
      case 'disconnected':
        return { tone: 'info', text: 'Disconnected from Discogs.' };
      case 'cancelled':
        return { tone: 'info', text: 'Connection cancelled.' };
      case 'error':
        return {
          tone: 'error',
          text: `Could not connect to Discogs${data.discogsDetail ? `: ${data.discogsDetail}` : ''}.`
        };
      default:
        return null;
    }
  });

  let isConnected = $derived(Boolean(data.profile?.discogs_oauth_token));
</script>

<svelte:head>
  <title>Settings — Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div class="eyebrow">Account</div>
    <h1>Your <em>settings</em>.</h1>
  </header>

  {#if banner}
    <div class="banner banner-{banner.tone}">
      <span>{banner.text}</span>
      <a href="/app/settings" class="banner-dismiss" aria-label="Dismiss">✕</a>
    </div>
  {/if}

  <section class="section">
    <h2>Account</h2>
    <div class="card">
      <div class="row">
        <div class="row-label">Email</div>
        <div class="row-value">{data.user.email}</div>
      </div>
      <div class="row">
        <div class="row-label">User ID</div>
        <div class="row-value mono">{data.user.id}</div>
      </div>
    </div>
  </section>

  <!-- ── Profile ──────────────────────────────────────── -->
  <section class="section">
    <h2>Profile</h2>
    <p class="lede">
      Your username unlocks the public profile (coming in the next phase). Display name
      and bio are what other people will see. Display currency converts all the prices
      you see across the app — your data stays stored in its original currency.
    </p>

    <div class="card">
      <form
        method="POST"
        action="?/updateProfile"
        onsubmit={() => { savingProfile = true; }}
      >
        <!-- Username -->
        <div class="field">
          <label for="username">Username</label>
          <div class="username-input">
            <span class="username-prefix">retrovault.no/u/</span>
            <input
              id="username"
              name="username"
              type="text"
              bind:value={username}
              oninput={onUsernameInput}
              maxlength="30"
              placeholder="your-handle"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
            />
            {#if username}
              <span class="username-status status-{usernameStatus}">
                {#if usernameStatus === 'checking'}…
                {:else if usernameStatus === 'available'}✓
                {:else if usernameStatus === 'taken'}taken
                {:else if usernameStatus === 'reserved'}reserved
                {:else if usernameStatus === 'format'}invalid
                {/if}
              </span>
            {/if}
          </div>
          <div class="field-hint">3–30 characters: lowercase letters, numbers, dash, underscore.</div>
        </div>

        <!-- Display name -->
        <div class="field">
          <label for="display_name">Display name</label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            bind:value={displayName}
            maxlength="60"
            placeholder="What people see on your profile"
          />
        </div>

        <!-- Bio -->
        <div class="field">
          <label for="bio">Bio</label>
          <textarea
            id="bio"
            name="bio"
            bind:value={bio}
            rows="3"
            maxlength="500"
            placeholder="A few words about you and your collection."
          ></textarea>
          <div class="field-hint">{bio.length}/500</div>
        </div>

        <!-- Currency -->
        <div class="field">
          <label for="display_currency">Display currency</label>
          <select id="display_currency" name="display_currency" bind:value={displayCurrency}>
            {#each SUPPORTED_CURRENCIES as code}
              <option value={code}>{CURRENCY_LABELS[code]}</option>
            {/each}
          </select>
          <div class="field-hint">
            All prices in the app convert to this currency. Your stored values are not modified.
          </div>
        </div>

        <!-- Public toggle -->
        <div class="field toggle-field">
          <label class="toggle-row">
            <input
              type="checkbox"
              name="is_public"
              bind:checked={isPublic}
              disabled={!username}
            />
            <span class="toggle-label">
              <span class="toggle-title">Make my profile public</span>
              <span class="toggle-hint">
                {#if !username}Add a username first to enable this.
                {:else}Anyone with the link can see your collections. The public page itself ships next phase.
                {/if}
              </span>
            </span>
          </label>
        </div>

        <!-- Hide values toggle -->
        {#if isPublic}
          <div class="field toggle-field">
            <label class="toggle-row">
              <input
                type="checkbox"
                name="show_values_publicly"
                bind:checked={showValuesPublicly}
              />
              <span class="toggle-label">
                <span class="toggle-title">Show monetary values on my public profile</span>
                <span class="toggle-hint">
                  When off, paid/value/totals are hidden from visitors. Counts and metadata still show.
                </span>
              </span>
            </label>
          </div>
        {/if}

        <div class="pref-actions">
          <button
            type="submit"
            class="btn primary"
            disabled={savingProfile || usernameStatus === 'taken' || usernameStatus === 'reserved' || usernameStatus === 'format'}
          >
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  </section>

  <section class="section">
    <h2>Discogs integration</h2>
    <p class="lede">
      Connect your Discogs account to pull in price suggestions, cover art, and tracklists when
      adding records. Retro Vault never modifies your Discogs account — it only reads.
    </p>

    <div class="card">
      {#if isConnected}
        <div class="row">
          <div class="row-label">Status</div>
          <div class="row-value">
            <span class="dot dot-success"></span>
            Connected
            {#if data.profile.discogs_username}
              as <strong>{data.profile.discogs_username}</strong>
            {/if}
          </div>
        </div>
        {#if data.profile.discogs_connected_at}
          <div class="row">
            <div class="row-label">Connected at</div>
            <div class="row-value mono">
              {new Date(data.profile.discogs_connected_at).toLocaleString()}
            </div>
          </div>
        {/if}
        <div class="row actions-row">
          <form
            method="POST"
            action="?/disconnectDiscogs"
            onsubmit={(e) => {
              if (!confirm('Disconnect Discogs? You can reconnect any time.')) {
                e.preventDefault();
              }
            }}
          >
            <button type="submit" class="btn ghost danger">Disconnect Discogs</button>
          </form>
        </div>
      {:else}
        <div class="row">
          <div class="row-label">Status</div>
          <div class="row-value">
            <span class="dot dot-muted"></span>
            Not connected
          </div>
        </div>
        <div class="row actions-row">
          <!-- Action on THIS page — no cross-route posting.
               data-sveltekit-reload ensures browser handles the redirect natively. -->
          <form method="POST" action="?/connectDiscogs" data-sveltekit-reload>
            <button type="submit" class="btn primary">
              Connect to Discogs →
            </button>
          </form>
        </div>

        <div class="hint">
          <strong>One small step required:</strong> Discogs only returns price data if your
          account has seller settings filled out (even if you never sell). You can do that
          <a
            href="https://www.discogs.com/settings/seller"
            target="_blank"
            rel="noopener noreferrer">here</a
          >
          — it takes a minute. Cover art and tracklists work without this.
        </div>
      {/if}
    </div>
  </section>

  <section class="section">
    <h2>Coming soon</h2>
  <!-- ── Display preferences ─────────────────────── -->
  <section class="section">
    <h2>Display</h2>
    <p class="lede">How records look in your collection.</p>

    <div class="card">
      <!-- Theme toggle: local-only setting, no form submission needed -->
      <div class="pref-row pref-row-bordered">
        <div class="pref-label">Theme</div>
        <div class="pref-options">
          <button
            type="button"
            class="radio-pill"
            class:checked={currentTheme === 'dark'}
            onclick={() => switchTheme('dark')}
          >
            <span class="radio-text">Late night</span>
            <span class="radio-hint">Dark mode — the original.</span>
          </button>
          <button
            type="button"
            class="radio-pill"
            class:checked={currentTheme === 'light'}
            onclick={() => switchTheme('light')}
          >
            <span class="radio-text">Daylight</span>
            <span class="radio-hint">Light mode — warm paper.</span>
          </button>
        </div>
      </div>

      <form
        method="POST"
        action="?/updatePreferences"
        onsubmit={() => { savingPrefs = true; }}
      >
        <div class="pref-row">
          <div class="pref-label">When flipping a record card</div>
          <div class="pref-options">
            {#each CARD_BACK_OPTIONS as opt}
              <label class="radio-pill" class:checked={cardBackView === opt.value}>
                <input
                  type="radio"
                  name="card_back_view"
                  value={opt.value}
                  bind:group={cardBackView}
                />
                <span class="radio-text">{opt.label}</span>
                <span class="radio-hint">{opt.hint}</span>
              </label>
            {/each}
          </div>
        </div>
        <div class="pref-actions">
          <button type="submit" class="btn primary" disabled={savingPrefs}>
            {savingPrefs ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </form>
    </div>
  </section>

  <section class="section">
    <h2>Coming soon</h2>
    <p class="placeholder">
      Username for public profile · Display currency · Theme &amp; mood preferences · Visible
      record formats · Data export · Account deletion
    </p>
  </section>
</div>

<style>
  .page {
    padding: 40px 40px 80px;
    max-width: 720px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 40px;
  }

  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 14px;
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(40px, 5.5vw, 60px);
    font-weight: 400;
    line-height: 0.95;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border-radius: var(--radius);
    margin-bottom: 30px;
    font-size: 14px;
  }

  .banner-success {
    background: rgba(127, 182, 133, 0.15);
    border: 1px solid var(--success);
    color: var(--success);
  }
  .banner-error {
    background: rgba(198, 74, 74, 0.12);
    border: 1px solid var(--danger);
    color: var(--danger);
  }
  .banner-info {
    background: var(--bg-3);
    border: 1px solid var(--groove);
    color: var(--ink-2);
  }

  .banner-dismiss {
    color: inherit;
    opacity: 0.5;
    text-decoration: none;
    font-size: 18px;
    padding: 0 4px;
  }
  .banner-dismiss:hover {
    opacity: 1;
  }

  .section {
    margin-bottom: 50px;
  }

  h2 {
    font-family: var(--ff-display);
    font-size: 26px;
    font-weight: 500;
    margin-bottom: 12px;
    color: var(--ink);
  }

  .lede {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 15px;
    color: var(--ink-2);
    line-height: 1.55;
    margin-bottom: 18px;
    max-width: 56ch;
  }

  .card {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    padding: 4px 24px;
  }

  .row {
    padding: 16px 0;
    border-bottom: 1px solid var(--groove);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .row:last-child {
    border-bottom: none;
  }

  .row.actions-row {
    flex-direction: row;
    gap: 10px;
    align-items: center;
  }

  .row-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .row-value {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .row-value strong {
    color: var(--accent);
    font-weight: 500;
  }

  .row-value.mono {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--ink-2);
    word-break: break-all;
  }

  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-success {
    background: var(--success);
    box-shadow: 0 0 0 3px rgba(127, 182, 133, 0.18);
  }

  .dot-muted {
    background: var(--ink-3);
  }

  .btn {
    padding: 11px 22px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition:
      background var(--t),
      color var(--t),
      transform var(--t);
    border: 1px solid transparent;
  }

  .btn.primary {
    background: var(--accent);
    color: var(--bg);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--ink);
  }

  .btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--groove);
  }

  .btn.ghost:hover {
    color: var(--ink);
    border-color: var(--ink-3);
  }

  .btn.ghost.danger:hover {
    color: var(--danger);
    border-color: var(--danger);
  }

  .hint {
    margin: 16px 0 4px;
    padding: 14px 16px;
    background: var(--bg-3);
    border-left: 2px solid var(--accent);
    border-radius: 0 var(--radius) var(--radius) 0;
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.55;
  }

  .hint strong {
    color: var(--ink);
    font-weight: 500;
  }

  .hint a {
    color: var(--accent);
    border-bottom: 1px solid var(--groove);
    transition: border-color var(--t);
  }

  .hint a:hover {
    border-color: var(--accent);
  }

  .placeholder {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-3);
    line-height: 1.6;
  }

  /* ── Preferences ─────────────────────────────────── */
  .pref-row { padding: 16px 0; }
  .pref-row-bordered {
    border-bottom: 1px solid var(--groove);
    margin-bottom: 8px;
  }
  .pref-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 12px;
  }
  .pref-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .radio-pill {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 11px 14px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color var(--t), background var(--t);
    text-align: left;          /* button reset */
    font: inherit;             /* button reset */
    color: inherit;            /* button reset */
    width: 100%;               /* button reset */
  }
  .radio-pill:hover { border-color: var(--ink-3); }
  .radio-pill.checked {
    border-color: var(--accent);
    background: rgba(212, 163, 86, 0.07);
  }
  .radio-pill input[type='radio'] {
    margin: 0;
    accent-color: var(--accent);
    flex-shrink: 0;
    align-self: center;
  }
  .radio-text {
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
  }
  .radio-pill.checked .radio-text { color: var(--accent); }
  .radio-hint {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-3);
  }
  .pref-actions {
    padding-top: 12px;
    display: flex;
    justify-content: flex-end;
  }

  /* ── Profile form ──────────────────────────────── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
  }
  .field + .field { border-top: 1px solid var(--groove); }
  .field label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .field input[type='text'],
  .field textarea,
  .field select {
    width: 100%;
    padding: 11px 14px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
    transition: border-color var(--t);
  }
  .field textarea {
    resize: vertical;
    min-height: 70px;
    font-family: var(--ff-body);
    line-height: 1.5;
    font-size: 15px;
  }
  .field input:focus,
  .field textarea:focus,
  .field select:focus {
    outline: none;
    border-color: var(--accent);
  }
  .field select {
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 5l3 3 3-3' stroke='%23c2a988' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
  }
  .field-hint {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-3);
  }

  /* Username input with prefix and status */
  .username-input {
    display: flex;
    align-items: stretch;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    transition: border-color var(--t);
    overflow: hidden;
  }
  .username-input:focus-within { border-color: var(--accent); }
  .username-prefix {
    padding: 11px 0 11px 14px;
    font-family: var(--ff-mono);
    font-size: 13px;
    color: var(--ink-3);
    flex-shrink: 0;
  }
  .username-input input {
    flex: 1;
    border: none;
    background: transparent;
    padding-left: 2px;
    min-width: 0;
  }
  .username-input input:focus { outline: none; border: none; }
  .username-status {
    align-self: center;
    margin-right: 12px;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .status-available { color: var(--success); }
  .status-taken,
  .status-reserved,
  .status-format { color: var(--danger); }

  /* Toggle fields (public, show values) */
  .toggle-field { padding: 14px 0; }
  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
  }
  .toggle-row input[type='checkbox'] {
    margin: 2px 0 0;
    accent-color: var(--accent);
    flex-shrink: 0;
  }
  .toggle-row input[type='checkbox']:disabled { opacity: 0.4; cursor: not-allowed; }
  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .toggle-title {
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
  }
  .toggle-hint {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-3);
  }

  @media (max-width: 640px) {
    .page {
      padding: 24px 22px 60px;
    }
  }
</style>
