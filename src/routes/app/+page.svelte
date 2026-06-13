<script>
  let { data } = $props();

  async function signOut() {
    await data.supabase.auth.signOut();
    window.location.href = '/';
  }
</script>

<svelte:head>
  <title>Your Vault — Hyllah</title>
</svelte:head>

<main class="app-shell">
  <header class="app-header">
    <div class="brand-mark">Hyl<em>lah</em></div>
    <div class="user-strip">
      <span class="user-email">{data.user.email}</span>
      <button class="link-btn" onclick={signOut}>Sign out</button>
    </div>
  </header>

  <div class="welcome">
    <div class="eyebrow">Welcome</div>
    <h1>Your vault is <em>ready</em>.</h1>
    <p>
      You're signed in. The shelves are empty for now — we'll build them out together in the next
      session. For now, this confirms the auth flow works.
    </p>
    <div class="info-grid">
      <div class="info">
        <div class="info-label">Signed in as</div>
        <div class="info-value">{data.user.email}</div>
      </div>
      <div class="info">
        <div class="info-label">User ID</div>
        <div class="info-value mono">{data.user.id}</div>
      </div>
    </div>
  </div>
</main>

<style>
  .app-shell {
    min-height: 100vh;
    padding: 30px 32px;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 28px;
    border-bottom: 1px solid var(--groove);
    margin-bottom: 60px;
  }

  .brand-mark {
    font-family: var(--ff-display);
    font-size: 24px;
    font-weight: 500;
  }

  .brand-mark em {
    font-style: italic;
    color: var(--accent);
  }

  .user-strip {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .user-email {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--ink-3);
  }

  .link-btn {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-2);
  }

  .link-btn:hover {
    color: var(--accent);
  }

  .welcome {
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
    padding: 60px 0;
  }

  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 16px;
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(40px, 6vw, 64px);
    font-weight: 400;
    line-height: 0.95;
    margin-bottom: 24px;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .welcome p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 18px;
    color: var(--ink-2);
    line-height: 1.55;
    max-width: 540px;
    margin: 0 auto 50px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    text-align: left;
    background: var(--bg-2);
    padding: 24px;
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
  }

  .info-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 6px;
  }

  .info-value {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
  }

  .info-value.mono {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--ink-2);
    word-break: break-all;
  }

  @media (max-width: 600px) {
    .info-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
