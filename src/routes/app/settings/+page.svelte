<script>
  import { enhance } from '$app/forms';

  let { data } = $props();

  let connecting = $state(false);

  let banner = $derived.by(() => {
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
            action="/app/discogs/disconnect"
            use:enhance={({ cancel }) => {
              if (!confirm('Disconnect Discogs? You can reconnect any time.')) {
                cancel();
                return;
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
          <form
            method="POST"
            action="/app/discogs/connect"
            use:enhance={() => {
              connecting = true;
              return async ({ update }) => {
                await update();
                connecting = false;
              };
            }}
          >
            <button type="submit" class="btn primary" disabled={connecting}>
              {connecting ? 'Redirecting...' : 'Connect to Discogs →'}
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

  @media (max-width: 640px) {
    .page {
      padding: 24px 22px 60px;
    }
  }
</style>
