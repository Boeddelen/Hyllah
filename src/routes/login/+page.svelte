<script>
  let { data } = $props();

  let email = $state('');
  let status = $state('idle'); // idle | sending | sent | error
  let errorMsg = $state('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email.trim()) return;

    status = 'sending';
    errorMsg = '';

    const { error } = await data.supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true
      }
    });

    if (error) {
      status = 'error';
      errorMsg = error.message;
    } else {
      status = 'sent';
    }
  }
</script>

<svelte:head>
  <title>Sign in — Retro Vault</title>
</svelte:head>

<main class="login-page">
  <a href="/" class="back-link">← Back</a>

  <div class="login-card">
    <div class="brand-mark">Retro <em>Vault</em></div>
    <div class="brand-sub">Sign in</div>

    {#if status === 'sent'}
      <div class="success-state">
        <div class="check">✓</div>
        <h1>Check your email</h1>
        <p>
          We sent a magic link to <strong>{email}</strong>.
          Open it on this device to sign in. The link works once and expires after 1 hour.
        </p>
        <p class="hint">No email after 2 minutes? Check your spam folder, or try again.</p>
        <button class="link-btn" onclick={() => (status = 'idle')}>← Use a different email</button>
      </div>
    {:else}
      <form onsubmit={handleSubmit}>
        <p class="explainer">
          No passwords here. Enter your email and we'll send you a link to sign in.
        </p>

        <label for="email">Your email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="you@example.com"
          required
          autocomplete="email"
          autofocus
          disabled={status === 'sending'}
        />

        <button type="submit" class="btn primary" disabled={status === 'sending' || !email.trim()}>
          {status === 'sending' ? 'Sending...' : 'Send magic link →'}
        </button>

        {#if status === 'error'}
          <div class="error">{errorMsg}</div>
        {/if}

        <p class="legal">
          By signing in you agree to our
          <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
        </p>
      </form>
    {/if}
  </div>
</main>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 32px;
    position: relative;
  }

  .back-link {
    position: absolute;
    top: 28px;
    left: 28px;
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .back-link:hover {
    color: var(--accent);
  }

  .login-card {
    max-width: 420px;
    width: 100%;
    text-align: center;
  }

  .brand-mark {
    font-family: var(--ff-display);
    font-size: 36px;
    font-weight: 500;
    line-height: 1;
  }

  .brand-mark em {
    font-style: italic;
    color: var(--accent);
  }

  .brand-sub {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-top: 10px;
    margin-bottom: 50px;
  }

  .explainer {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-2);
    line-height: 1.5;
    margin-bottom: 36px;
  }

  label {
    display: block;
    text-align: left;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 8px;
  }

  input {
    width: 100%;
    padding: 14px 16px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-size: 16px;
    color: var(--ink);
    margin-bottom: 20px;
    font-family: var(--ff-display);
  }

  input:focus {
    border-color: var(--accent);
  }

  .btn {
    width: 100%;
    padding: 14px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition:
      background var(--t),
      color var(--t),
      transform var(--t);
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

  .error {
    margin-top: 18px;
    padding: 12px;
    background: rgba(198, 74, 74, 0.1);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 13px;
  }

  .legal {
    margin-top: 30px;
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.5;
  }

  .legal a {
    color: var(--ink-2);
    border-bottom: 1px solid var(--groove);
  }

  .legal a:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .success-state {
    text-align: center;
  }

  .check {
    width: 56px;
    height: 56px;
    margin: 0 auto 24px;
    border-radius: 50%;
    background: var(--accent-glow);
    border: 1px solid var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    font-size: 28px;
  }

  .success-state h1 {
    font-family: var(--ff-display);
    font-size: 32px;
    font-weight: 500;
    margin-bottom: 20px;
  }

  .success-state p {
    font-size: 15px;
    color: var(--ink-2);
    line-height: 1.6;
    margin-bottom: 14px;
  }

  .success-state strong {
    color: var(--ink);
  }

  .hint {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--ink-3) !important;
    letter-spacing: 0.02em;
  }

  .link-btn {
    margin-top: 16px;
    color: var(--accent);
    font-size: 13px;
    text-decoration: underline;
  }
</style>
