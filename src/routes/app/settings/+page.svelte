<script>
  // NOTE: We do NOT import enhance here.
  // The connect form must NOT use enhance — enhance intercepts redirects
  // client-side via fetch, which cannot follow an external redirect to
  // discogs.com. Plain form POST lets the browser handle the redirect natively.

  import { onMount, onDestroy } from 'svelte';
  import { THEMES, getThemeId, setThemeId, getMode, setMode, getA11ySettings, setA11y } from '$lib/theme.js';
  import { SUPPORTED_CURRENCIES, CURRENCY_LABELS } from '$lib/currency.js';
  import AvatarUpload from '$lib/components/AvatarUpload.svelte';

  let { data } = $props();

  const CARD_BACK_OPTIONS = [
    { value: 'details',   label: 'Album details',  hint: 'Format, year, label, condition, notes…' },
    { value: 'tracklist', label: 'Tracklist',      hint: 'Just the tracks.' },
    { value: 'both',      label: 'Both',           hint: 'Details first, then tracklist below.' }
  ];

  let cardBackView = $state(data.profile?.card_back_view ?? 'details');
  let useDiscogsPrices = $state(data.profile?.use_discogs_prices !== false); // default true
  let showValueSource = $state(data.profile?.show_value_source === true);     // default false
  let showArchive = $state(data.profile?.show_archive !== false);            // default true (shown)
  let savingPrefs = $state(false);

  // ── Profile state ──────────────────────────────────────
  let username       = $state(data.profile?.username ?? '');
  let displayName    = $state(data.profile?.display_name ?? '');
  let bio            = $state(data.profile?.bio ?? '');
  let displayCurrency = $state(data.profile?.display_currency ?? 'EUR');
  let isPublic        = $state(data.profile?.is_public ?? false);
  let savingProfile = $state(false);

  // ── Public profile theme state ─────────────────────────
  let publicTheme = $state(data.profile?.public_theme ?? 'listening-room');
  let publicMode  = $state(data.profile?.public_mode  ?? 'dark');
  let savingPublicTheme = $state(false);

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
  let currentTheme = $state('listening-room');
  let currentMode = $state('dark');
  let a11y = $state({ reducedMotion: false, highContrast: false, largeText: false, colorBlind: false });

  onMount(() => {
    currentTheme = getThemeId();
    currentMode = getMode();
    a11y = getA11ySettings();
    // Trigger initial check so the indicator is right on first load
    if (username) onUsernameInput();
  });
  function switchTheme(themeId) {
    currentTheme = themeId;
    setThemeId(themeId);
  }
  function switchMode(mode) {
    currentMode = mode;
    setMode(mode);
  }

  // ── Avatar actions ─────────────────────────────────────────
  async function updateAvatar(url) {
    // Fire a POST to updateAvatarUrl action on the server
    const formData = new FormData();
    formData.append('avatarUrl', url);
    try {
      const res = await fetch('?/updateAvatarUrl', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) console.error('Avatar update failed');
    } catch (err) {
      console.error('Avatar upload error:', err);
    }
  }

  function removeAvatar() {
    if (confirm('Remove your avatar?')) {
      const formData = new FormData();
      formData.append('action', 'removeAvatar');
      fetch('?/updateAvatarUrl', {
        method: 'POST',
        body: formData
      }).catch((err) => console.error('Avatar remove error:', err));
    }
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
    if (data.pubThemeStatus === 'saved') {
      return { tone: 'success', text: 'Public profile theme saved.' };
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
  <title>Settings — Hyllah</title>
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
      Your username unlocks the public profile. Display name
      and bio are what other people will see. Display currency converts all the prices
      you see across the app — your data stays stored in its original currency.
    </p>

    <div class="card">
      <!-- Avatar ─────────────────────────────────────────────── -->
      <div class="avatar-row">
        <div class="avatar-container">
          {#if data.profile?.avatar_url}
            <img src={data.profile.avatar_url} alt="Your avatar" class="avatar-image" />
          {:else}
            <div class="avatar-placeholder">
              <svg class="avatar-icon" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <!-- Simple head + shoulders silhouette -->
                <circle cx="24" cy="16" r="7" />
                <path d="M 12 32 Q 12 24 24 24 Q 36 24 36 32 L 36 40 Q 36 44 32 44 L 16 44 Q 12 44 12 40 Z" />
              </svg>
            </div>
          {/if}
        </div>
        <div class="avatar-actions">
          <AvatarUpload
            supabase={data.supabase}
            userId={data.user.id}
            onUploadComplete={(url) => {
              // Update the profile immediately so the UI reflects it
              if (data.profile) data.profile.avatar_url = url;
              // Also update the server — submit a form action
              updateAvatar(url);
            }}
          />
          {#if data.profile?.avatar_url}
            <button type="button" class="btn ghost small danger" onclick={removeAvatar}>
              Remove avatar
            </button>
          {/if}
        </div>
      </div>

      <form
        method="POST"
        action="?/updateProfile"
        onsubmit={() => { savingProfile = true; }}
      >
        <!-- Username -->
        <div class="field">
          <label for="username">Username</label>
          <div class="username-input">
            <span class="username-prefix">hyllah.com/u/</span>
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
                {:else}Anyone with the link can see your collections.
                {/if}
              </span>
            </span>
          </label>
        </div>

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
      adding records. Hyllah never modifies your Discogs account — it only reads.
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

  <!-- ── Display preferences ─────────────────────── -->
  <section class="section">
    <h2>Display</h2>
    <p class="lede">How records look in your collection.</p>

    <div class="card">
      <!-- Theme picker -->
      <div class="pref-row pref-row-bordered">
        <div class="pref-label">Theme</div>
        <div class="theme-grid">
          {#each THEMES as theme (theme.id)}
            <button
              type="button"
              class="theme-card"
              class:active={currentTheme === theme.id}
              onclick={() => switchTheme(theme.id)}
            >
              <div class="theme-swatches">
                {#each theme.swatches[currentMode] as color}
                  <div class="theme-swatch" style="background: {color};"></div>
                {/each}
              </div>
              <div class="theme-card-name">{theme.name}</div>
              <div class="theme-card-genre">{theme.genre}</div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Mode toggle (dark / light) -->
      <div class="pref-row pref-row-bordered">
        <div class="pref-label">Mode</div>
        <div class="pref-options">
          <button
            type="button"
            class="radio-pill"
            class:checked={currentMode === 'dark'}
            onclick={() => switchMode('dark')}
          >
            <span class="radio-text">Dark</span>
            <span class="radio-hint">The default — easy on the eyes.</span>
          </button>
          <button
            type="button"
            class="radio-pill"
            class:checked={currentMode === 'light'}
            onclick={() => switchMode('light')}
          >
            <span class="radio-text">Light</span>
            <span class="radio-hint">For daytime browsing.</span>
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

        <div class="pref-row pref-row-bordered">
          <div class="pref-label">Value calculation</div>
          <label class="toggle-row">
            <input type="checkbox" name="use_discogs_prices" bind:checked={useDiscogsPrices} />
            <span class="toggle-label">
              <span class="toggle-title">Use Discogs prices for collection value</span>
              <span class="toggle-hint">
                When on, records linked to Discogs use the suggested price for their condition
                as their value — unless you've set a custom value, which always wins.
                When off, only records with a custom value contribute to totals.
              </span>
            </span>
          </label>
        </div>

        <div class="pref-row pref-row-bordered">
          <div class="pref-label">Card detail</div>
          <label class="toggle-row">
            <input type="checkbox" name="show_value_source" bind:checked={showValueSource} />
            <span class="toggle-label">
              <span class="toggle-title">Show value source on card back</span>
              <span class="toggle-hint">
                Annotates each record's Value row with "your value" or "from Discogs" so it's
                clear where the number comes from.
              </span>
            </span>
          </label>
        </div>

        <div class="pref-row pref-row-bordered">
          <div class="pref-label">Sidebar</div>
          <label class="toggle-row">
            <input type="checkbox" name="show_archive" bind:checked={showArchive} />
            <span class="toggle-label">
              <span class="toggle-title">Show Archive in sidebar</span>
              <span class="toggle-hint">
                Keeps an Archive link in the sidebar for reaching archived records.
                Turn it off to hide the link — your archived records are still kept,
                and you can switch this back on here any time.
              </span>
            </span>
          </label>
        </div>

        <div class="pref-actions">
          <button type="submit" class="btn primary" disabled={savingPrefs}>
            {savingPrefs ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </form>
    </div>
  </section>

  <!-- ── Public profile theme ──────────────────────────── -->
  <section class="section">
    <h2>Public profile</h2>
    <p class="lede">
      Choose how your profile looks to visitors at
      <span class="profile-url">hyllah.com/u/{data.profile?.username ?? 'your-username'}</span>.
      This is independent from your own app theme.
    </p>

    {#if !data.profile?.username || !data.profile?.is_public}
      <div class="info-banner">
        You need a username and a public profile before this takes effect.
        Set both in the Profile section above.
      </div>
    {/if}

    <div class="card">
      <form
        method="POST"
        action="?/updatePublicTheme"
        onsubmit={() => { savingPublicTheme = true; }}
      >
        <input type="hidden" name="public_theme" value={publicTheme} />
        <input type="hidden" name="public_mode" value={publicMode} />

        <!-- Theme picker -->
        <div class="pref-row pref-row-bordered">
          <div class="pref-label">Profile theme</div>
          <div class="theme-grid">
            {#each THEMES as theme (theme.id)}
              <button
                type="button"
                class="theme-card"
                class:active={publicTheme === theme.id}
                onclick={() => (publicTheme = theme.id)}
              >
                <div class="theme-swatches">
                  {#each theme.swatches[publicMode] as color}
                    <div class="theme-swatch" style="background: {color};"></div>
                  {/each}
                </div>
                <div class="theme-card-name">{theme.name}</div>
                <div class="theme-card-genre">{theme.genre}</div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Mode toggle -->
        <div class="pref-row pref-row-bordered">
          <div class="pref-label">Mode</div>
          <div class="pref-options">
            <button
              type="button"
              class="radio-pill"
              class:checked={publicMode === 'dark'}
              onclick={() => (publicMode = 'dark')}
            >
              <span class="radio-text">Dark</span>
              <span class="radio-hint">The brooding choice.</span>
            </button>
            <button
              type="button"
              class="radio-pill"
              class:checked={publicMode === 'light'}
              onclick={() => (publicMode = 'light')}
            >
              <span class="radio-text">Light</span>
              <span class="radio-hint">For the daylight crowd.</span>
            </button>
          </div>
        </div>

        <div class="pref-actions">
          <button type="submit" class="btn primary" disabled={savingPublicTheme}>
            {savingPublicTheme ? 'Saving…' : 'Save public theme'}
          </button>
          {#if data.profile?.username && data.profile?.is_public}
            <a
              href="/u/{data.profile.username}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn outline"
            >
              Preview profile ↗
            </a>
          {/if}
        </div>
      </form>
    </div>
  </section>

  <!-- ── Accessibility ─────────────────────────────────── -->
  <section class="section">
    <h2>Accessibility</h2>
    <p class="lede">
      Adjust the app to suit your needs. These settings are local — they apply
      on this device only and take effect immediately.
    </p>

    <div class="card">
      <!-- Reduced motion -->
      <div class="a11y-row">
        <div class="a11y-row-text">
          <div class="a11y-row-label">Reduced motion</div>
          <div class="a11y-row-hint">
            Disables card flip animations and hover transitions. Also respects
            your operating system's "Reduce motion" preference automatically.
          </div>
        </div>
        <button
          type="button"
          class="toggle-btn"
          class:on={a11y.reducedMotion}
          aria-checked={a11y.reducedMotion}
          role="switch"
          aria-label="Reduced motion"
          onclick={() => {
            a11y.reducedMotion = !a11y.reducedMotion;
            setA11y('reducedMotion', a11y.reducedMotion);
          }}
        >
          <span class="toggle-knob"></span>
        </button>
      </div>

      <!-- High contrast -->
      <div class="a11y-row">
        <div class="a11y-row-text">
          <div class="a11y-row-label">High contrast</div>
          <div class="a11y-row-hint">
            Increases contrast between text, borders, and backgrounds across
            all themes. Useful for low-vision or bright-environment use.
          </div>
        </div>
        <button
          type="button"
          class="toggle-btn"
          class:on={a11y.highContrast}
          aria-checked={a11y.highContrast}
          role="switch"
          aria-label="High contrast"
          onclick={() => {
            a11y.highContrast = !a11y.highContrast;
            setA11y('highContrast', a11y.highContrast);
          }}
        >
          <span class="toggle-knob"></span>
        </button>
      </div>

      <!-- Large text -->
      <div class="a11y-row">
        <div class="a11y-row-text">
          <div class="a11y-row-label">Large text</div>
          <div class="a11y-row-hint">
            Increases all text sizes by 25%. Helps if the default text is
            difficult to read.
          </div>
        </div>
        <button
          type="button"
          class="toggle-btn"
          class:on={a11y.largeText}
          aria-checked={a11y.largeText}
          role="switch"
          aria-label="Large text"
          onclick={() => {
            a11y.largeText = !a11y.largeText;
            setA11y('largeText', a11y.largeText);
          }}
        >
          <span class="toggle-knob"></span>
        </button>
      </div>

      <!-- Color blind friendly -->
      <div class="a11y-row">
        <div class="a11y-row-text">
          <div class="a11y-row-label">Color blind friendly</div>
          <div class="a11y-row-hint">
            Adds text labels and underlines wherever color alone is used to
            convey meaning — like public/private status and condition grades.
          </div>
        </div>
        <button
          type="button"
          class="toggle-btn"
          class:on={a11y.colorBlind}
          aria-checked={a11y.colorBlind}
          role="switch"
          aria-label="Color blind friendly"
          onclick={() => {
            a11y.colorBlind = !a11y.colorBlind;
            setA11y('colorBlind', a11y.colorBlind);
          }}
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </div>
  </section>

  <!-- ── Your data (export + delete) ───────────────── -->
  <section class="section">
    <h2>Your data</h2>
    <p class="lede">
      Take your collection with you, or leave for good. Your data is yours.
    </p>

    <div class="card">
      <div class="data-row">
        <div class="data-row-text">
          <div class="data-row-title">Download a copy</div>
          <div class="data-row-hint">
            Everything you own — profile, collections, records, tracklists, and the
            many-to-many links between them — in one JSON file.
          </div>
        </div>
        <a href="/api/account/export" class="btn ghost" download>Export JSON</a>
      </div>

      <div class="data-row danger-row">
        <div class="data-row-text">
          <div class="data-row-title danger-title">Delete account</div>
          <div class="data-row-hint">
            Permanent. Removes your records, collections, profile, and Discogs link.
            You'll be asked to type a confirmation phrase.
          </div>
        </div>
        <a href="/app/settings/delete" class="btn ghost danger-link">Delete…</a>
      </div>
    </div>
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

  /* ── Avatar ──────────────────────────────────────── */
  .avatar-row {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 16px 0;
    border-bottom: 1px solid var(--groove);
  }
  .avatar-container {
    flex-shrink: 0;
  }
  .avatar-image,
  .avatar-placeholder {
    display: block;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--bg-3);
    border: 1px solid var(--groove);
  }
  .avatar-image {
    object-fit: cover;
  }
  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .avatar-icon {
    width: 42px;
    height: 42px;
    color: var(--ink-3);
  }
  .avatar-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .avatar-actions .btn {
    font-size: 12px;
    padding: 8px 12px;
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
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 12px;
  }

  /* ── Theme picker grid ──────────────────────────── */
  .theme-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .theme-card {
    padding: 12px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: border-color var(--t), background var(--t);
    text-align: left;
    font: inherit;
    color: inherit;
    width: 100%;
  }
  .theme-card:hover { border-color: var(--ink-3); }
  .theme-card.active {
    border-color: var(--accent);
    border-width: 2px;
    background: var(--accent-glow);
    position: relative;
  }
  .theme-card.active::after {
    content: '✓';
    position: absolute;
    top: 8px;
    right: 10px;
    font-size: 11px;
    font-family: var(--ff-mono);
    font-weight: 700;
    color: var(--accent);
    line-height: 1;
  }
  .theme-swatches {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }
  .theme-swatch {
    flex: 1;
    height: 18px;
    border-radius: 3px;
    border: 1px solid rgba(128, 128, 128, 0.15);
  }
  .theme-card-name {
    font-family: var(--ff-display);
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
    margin-bottom: 2px;
  }
  .theme-card-genre {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
  }
  @media (max-width: 480px) {
    .theme-grid { grid-template-columns: 1fr; }
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
    background: var(--accent-glow);
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

  /* ── Public profile theme section ───────────────── */
  .profile-url {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--accent);
  }
  .info-banner {
    padding: 12px 16px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
    margin-bottom: 16px;
    line-height: 1.5;
  }

  /* ── Accessibility section ──────────────────────── */
  .a11y-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 18px 0;
    border-bottom: 1px solid var(--groove);
  }
  .a11y-row:last-child { border-bottom: none; }
  .a11y-row-text { flex: 1; min-width: 0; }
  .a11y-row-label {
    font-family: var(--ff-display);
    font-size: 15px;
    font-weight: 500;
    color: var(--ink);
    margin-bottom: 4px;
  }
  .a11y-row-hint {
    font-family: var(--ff-body);
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.5;
  }

  /* Toggle switch */
  .toggle-btn {
    flex-shrink: 0;
    width: 44px;
    height: 24px;
    border-radius: 99px;
    background: var(--bg-3);
    border: 1.5px solid var(--groove);
    cursor: pointer;
    position: relative;
    transition: background var(--t), border-color var(--t);
    padding: 0;
  }
  .toggle-btn.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--ink-3);
    transition: transform var(--t), background var(--t);
    display: block;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }
  .toggle-btn.on .toggle-knob {
    transform: translateX(20px);
    background: var(--bg);
  }
  .toggle-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* ── Your data (export + delete) ─────────────── */
  .data-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 18px 0;
  }
  .data-row + .data-row { border-top: 1px solid var(--groove); }
  .data-row-text {
    flex: 1;
    min-width: 0;
  }
  .data-row-title {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
    margin-bottom: 4px;
  }
  .data-row-title.danger-title {
    color: var(--danger);
  }
  .data-row-hint {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.5;
  }
  .btn.ghost.danger-link {
    color: var(--danger);
    border-color: var(--groove);
  }
  .btn.ghost.danger-link:hover {
    border-color: var(--danger);
    color: var(--danger);
  }

  @media (max-width: 640px) {
    .page {
      padding: 24px 22px 60px;
    }
    .data-row {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    .data-row .btn {
      justify-content: center;
      width: 100%;
    }
  }
</style>
