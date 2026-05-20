<script>
  import { enhance } from '$app/forms';

  let { data, form } = $props();

  let phrase = $state('');
  let submitting = $state(false);

  // The literal phrase must match — case-insensitive on the client side too,
  // for kindness. The server normalizes the same way.
  const REQUIRED_PHRASE = 'delete my account';

  let phraseMatches = $derived(phrase.trim().toLowerCase() === REQUIRED_PHRASE);

  // Format the account-age line nicely
  function formatJoined(iso) {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return null;
    }
  }

  let joinedDate = $derived(formatJoined(data.summary.created_at));
</script>

<svelte:head>
  <title>Delete account — Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <a class="back-link" href="/app/settings">← Back to settings</a>
    <div class="eyebrow danger">Permanent</div>
    <h1>Delete your <em>account</em>.</h1>
  </header>

  <section class="section">
    <div class="card danger-card">
      <h2>What you're about to delete</h2>

      <ul class="summary-list">
        {#if data.summary.username || data.summary.display_name}
          <li>
            <span class="summary-label">Account</span>
            <span class="summary-value">
              {data.summary.display_name || data.summary.username}
              {#if data.summary.username && data.summary.display_name}
                <span class="muted">({data.summary.username})</span>
              {/if}
            </span>
          </li>
        {/if}
        {#if joinedDate}
          <li>
            <span class="summary-label">Joined</span>
            <span class="summary-value">{joinedDate}</span>
          </li>
        {/if}
        <li>
          <span class="summary-label">Records</span>
          <span class="summary-value">
            {data.summary.records} {data.summary.records === 1 ? 'record' : 'records'}
          </span>
        </li>
        <li>
          <span class="summary-label">Collections</span>
          <span class="summary-value">
            {data.summary.collections} {data.summary.collections === 1 ? 'collection' : 'collections'}
          </span>
        </li>
      </ul>

      <p class="lede serious">
        This will permanently remove your records, collections, tracklists, tags, and profile
        from Retro Vault. Your Discogs connection will be unlinked. You will be signed out and
        the account cannot be restored.
      </p>

      <p class="lede serious">
        Uploaded cover images may remain in storage for a short period before they're cleaned up.
        Nothing in them is publicly accessible without your account, but if that matters to you,
        export your data first and let us know.
      </p>

      <p class="lede">
        Want to take your data with you first? <a href="/api/account/export" class="export-link">Download a JSON export</a>.
      </p>
    </div>
  </section>

  <section class="section">
    <div class="card">
      <h2>Confirm</h2>
      <p class="lede">
        Type <strong class="phrase">{REQUIRED_PHRASE}</strong> below to enable the delete button.
      </p>

      <form
        method="POST"
        action="?/confirm"
        use:enhance={() => {
          submitting = true;
          return async ({ result, update }) => {
            if (result.type === 'redirect') {
              // The server redirected to /?deleted=1 — let it through
              await update();
            } else {
              await update();
              submitting = false;
            }
          };
        }}
      >
        <div class="field">
          <label for="phrase">Confirmation phrase</label>
          <input
            id="phrase"
            name="phrase"
            type="text"
            bind:value={phrase}
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            placeholder={REQUIRED_PHRASE}
          />
        </div>

        {#if form?.error}
          <div class="error">{form.error}</div>
        {/if}

        <div class="actions">
          <a href="/app/settings" class="btn ghost">Cancel</a>
          <button
            type="submit"
            class="btn danger-btn"
            disabled={!phraseMatches || submitting}
          >
            {submitting ? 'Deleting…' : 'Delete my account permanently'}
          </button>
        </div>
      </form>
    </div>
  </section>
</div>

<style>
  .page { padding: 40px 40px 80px; max-width: 720px; margin: 0 auto; }
  .page-header { margin-bottom: 32px; }

  .back-link {
    display: inline-block;
    margin-bottom: 16px;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    transition: color var(--t);
  }
  .back-link:hover { color: var(--ink); }

  .eyebrow {
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.3em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 14px;
  }
  .eyebrow.danger { color: var(--danger); }

  h1 {
    font-family: var(--ff-display); font-size: clamp(36px, 5vw, 56px);
    font-weight: 400; line-height: 0.95;
  }
  h1 em { font-style: italic; color: var(--danger); font-weight: 500; }

  .section { margin-bottom: 32px; }
  .card {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    padding: 26px;
  }
  .danger-card { border-color: var(--danger); }

  h2 {
    font-family: var(--ff-display); font-size: 22px;
    font-weight: 500; margin-bottom: 14px; color: var(--ink);
  }

  .summary-list {
    list-style: none;
    padding: 0;
    margin: 0 0 22px;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--groove);
  }
  .summary-list li {
    display: flex;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--groove);
  }
  .summary-label {
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-3);
  }
  .summary-value {
    font-family: var(--ff-display); font-size: 15px; color: var(--ink);
  }
  .muted { color: var(--ink-3); font-style: italic; }

  .lede {
    font-family: var(--ff-display);
    font-size: 14px;
    line-height: 1.55;
    color: var(--ink-2);
    margin-bottom: 12px;
  }
  .lede.serious { color: var(--ink); }
  .lede strong.phrase {
    font-family: var(--ff-mono);
    font-size: 13px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    padding: 2px 8px;
    color: var(--danger);
    font-weight: 500;
  }

  .export-link {
    color: var(--accent);
    border-bottom: 1px solid var(--groove);
    transition: border-color var(--t);
  }
  .export-link:hover { border-color: var(--accent); }

  /* ── Form ─────────────────────────────────────── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }
  .field label {
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-3);
  }
  .field input {
    width: 100%;
    padding: 12px 14px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 14px;
    color: var(--ink);
    transition: border-color var(--t);
  }
  .field input:focus {
    outline: none;
    border-color: var(--danger);
  }

  .error {
    padding: 11px 14px;
    background: rgba(198, 74, 74, 0.12);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius);
    font-size: 13px;
    margin-bottom: 16px;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .btn {
    padding: 11px 22px;
    border-radius: var(--radius);
    font-family: var(--ff-mono); font-size: 11px;
    font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 1px solid transparent;
    transition: background var(--t), color var(--t), border-color var(--t);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }
  .btn.ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--groove);
    text-decoration: none;
  }
  .btn.ghost:hover { color: var(--ink); border-color: var(--ink-3); }

  .btn.danger-btn {
    background: var(--danger);
    color: var(--bg);
    border-color: var(--danger);
  }
  .btn.danger-btn:hover:not(:disabled) { opacity: 0.9; }
  .btn.danger-btn:disabled {
    background: var(--bg-3);
    color: var(--ink-3);
    border-color: var(--groove);
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .page { padding: 24px 18px 60px; }
    .actions { flex-direction: column-reverse; }
    .actions .btn { width: 100%; justify-content: center; }
  }
</style>
