<script>
  let { data } = $props();
</script>

<svelte:head>
  <title>Settings — Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div class="eyebrow">Account</div>
    <h1>Your <em>settings</em>.</h1>
  </header>

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

  <p class="placeholder">
    The full settings page — username, Discogs token, theme/mood preferences, public profile
    toggle, data export, and account deletion — is coming in a later session.
  </p>
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

  .card {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    padding: 24px;
    margin-bottom: 24px;
  }

  .row {
    padding: 16px 0;
    border-bottom: 1px solid var(--groove);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 4px;
  }

  .row-value {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
  }

  .row-value.mono {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--ink-2);
    word-break: break-all;
  }

  .placeholder {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 15px;
    color: var(--ink-3);
    line-height: 1.6;
  }
</style>
