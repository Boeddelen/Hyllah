<script>
  let { data } = $props();

  // ── State ────────────────────────────────────────
  let email = $state('');
  let code = $state('');
  let method = $state('code'); // 'code' | 'link' — user's preferred method
  let status = $state('idle');
  // idle | sending | awaiting_code | verifying | sent_link | error
  let errorMsg = $state('');
  let resendCooldown = $state(0); // seconds until resend is available

  let cooldownTimer = null;

  // ── Email submit ─────────────────────────────────
  async function handleEmailSubmit(event) {
    event.preventDefault();
    if (!email.trim() || status === 'sending') return;

    status = 'sending';
    errorMsg = '';

    const { error } = await data.supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // shouldSendEmail controls whether Supabase sends a magic link or OTP.
        // We always send — the difference is what we do after.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true
      }
    });

    if (error) {
      status = 'error';
      errorMsg = error.message;
      return;
    }

    if (method === 'code') {
      status = 'awaiting_code';
      startResendCooldown();
    } else {
      status = 'sent_link';
    }
  }

  // ── Code verification ────────────────────────────
  async function handleCodeSubmit(event) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 6 || status === 'verifying') return;

    status = 'verifying';
    errorMsg = '';

    const { error } = await data.supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmed,
      type: 'email'
    });

    if (error) {
      status = 'awaiting_code'; // let them try again
      errorMsg =
        error.message?.includes('expired') || error.message?.includes('invalid')
          ? 'That code is incorrect or has expired. Request a new one below.'
          : error.message;
      return;
    }

    // Success — Supabase sets the session; redirect to app
    window.location.href = '/app/all';
  }

  // ── Resend cooldown ──────────────────────────────
  function startResendCooldown() {
    resendCooldown = 30;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      resendCooldown -= 1;
      if (resendCooldown <= 0) {
        resendCooldown = 0;
        clearInterval(cooldownTimer);
      }
    }, 1000);
  }

  async function resendCode() {
    if (resendCooldown > 0 || status === 'sending') return;
    status = 'sending';
    errorMsg = '';
    code = '';

    const { error } = await data.supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true
      }
    });

    if (error) {
      status = 'awaiting_code';
      errorMsg = error.message;
      return;
    }

    status = 'awaiting_code';
    startResendCooldown();
  }

  function reset() {
    status = 'idle';
    code = '';
    errorMsg = '';
    resendCooldown = 0;
    clearInterval(cooldownTimer);
  }

  // Auto-submit when 6 digits entered
  function onCodeInput(e) {
    // Strip non-digits
    code = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (code.length === 6) {
      handleCodeSubmit(new Event('submit'));
    }
  }
</script>

<svelte:head>
  <title>Sign in — Hyllah</title>
</svelte:head>

<main class="login-page">
  <a href="/" class="back-link">← Back</a>

  <div class="login-card">
    <div class="brand-mark">Hyl<em>lah</em></div>
    <div class="brand-sub">Sign in</div>

    <!-- ── Sent magic link ───────────────────────── -->
    {#if status === 'sent_link'}
      <div class="success-state">
        <div class="check">✓</div>
        <h1>Check your email</h1>
        <p>
          We sent a magic link to <strong>{email}</strong>.
          Open it on this device to sign in.
        </p>
        <p class="hint">Link expires after 10 minutes. No email? Check your spam folder.</p>
        <button class="link-btn" onclick={reset}>← Use a different email</button>
      </div>

    <!-- ── Awaiting OTP code ──────────────────────── -->
    {:else if status === 'awaiting_code' || status === 'verifying'}
      <div class="code-state">
        <div class="code-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="14" width="32" height="24" rx="3" />
            <path d="M8 20h32" />
            <path d="M16 10v8M32 10v8" />
          </svg>
        </div>
        <h1>Enter the code</h1>
        <p class="code-sub">
          We sent a 6-digit code to <strong>{email}</strong>.
        </p>

        {#if errorMsg}
          <div class="error" role="alert">{errorMsg}</div>
        {/if}

        <form onsubmit={handleCodeSubmit}>
          <label for="otp-code">6-digit code</label>
          <input
            id="otp-code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="\d{6}"
            maxlength="6"
            placeholder="000000"
            class="code-input"
            value={code}
            oninput={onCodeInput}
            disabled={status === 'verifying'}
            autofocus
            aria-describedby="code-hint"
          />
          <p id="code-hint" class="hint" style="margin-bottom: 20px;">
            The code expires after 10 minutes.
          </p>

          <button
            type="submit"
            class="btn primary"
            disabled={code.length < 6 || status === 'verifying'}
          >
            {status === 'verifying' ? 'Verifying...' : 'Verify code →'}
          </button>
        </form>

        <div class="resend-row">
          {#if resendCooldown > 0}
            <span class="resend-hint">Resend in {resendCooldown}s</span>
          {:else}
            <button
              class="link-btn"
              onclick={resendCode}
              disabled={status === 'sending'}
            >
              {status === 'sending' ? 'Sending...' : 'Resend code'}
            </button>
          {/if}
          <span class="sep">·</span>
          <button class="link-btn" onclick={reset}>Use a different email</button>
        </div>

        <div class="switch-method-row">
          <button
            class="link-btn muted"
            onclick={async () => { method = 'link'; await resendCode(); }}
            disabled={resendCooldown > 0 || status === 'sending'}
          >
            Send a magic link instead
          </button>
        </div>
      </div>

    <!-- ── Email entry ────────────────────────────── -->
    {:else}
      <!-- Method toggle -->
      <div class="method-toggle" role="group" aria-label="Sign-in method">
        <button
          type="button"
          class="method-btn"
          class:active={method === 'code'}
          onclick={() => (method = 'code')}
          aria-pressed={method === 'code'}
        >
          6-digit code
        </button>
        <button
          type="button"
          class="method-btn"
          class:active={method === 'link'}
          onclick={() => (method = 'link')}
          aria-pressed={method === 'link'}
        >
          Magic link
        </button>
      </div>

      <form onsubmit={handleEmailSubmit}>
        <p class="explainer">
          {#if method === 'code'}
            Enter your email and we'll send a 6-digit code to sign in.
            No passwords, no fuss.
          {:else}
            Enter your email and we'll send a link you click to sign in.
          {/if}
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

        <button
          type="submit"
          class="btn primary"
          disabled={status === 'sending' || !email.trim()}
        >
          {#if status === 'sending'}
            Sending…
          {:else if method === 'code'}
            Send code →
          {:else}
            Send magic link →
          {/if}
        </button>

        {#if status === 'error'}
          <div class="error" role="alert">{errorMsg}</div>
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
    transition: color var(--t);
  }
  .back-link:hover { color: var(--accent); }

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
    color: var(--ink);
  }
  .brand-mark em { font-style: italic; color: var(--accent); }

  .brand-sub {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-top: 10px;
    margin-bottom: 40px;
  }

  /* ── Method toggle ────────────────────────────── */
  .method-toggle {
    display: flex;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    padding: 3px;
    margin-bottom: 28px;
  }
  .method-btn {
    flex: 1;
    padding: 9px 14px;
    border-radius: calc(var(--radius) - 2px);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background var(--t), color var(--t);
  }
  .method-btn.active {
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 1px 4px var(--shadow);
  }
  .method-btn:not(.active):hover { color: var(--ink-2); }

  /* ── Form ──────────────────────────────────────── */
  .explainer {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-2);
    line-height: 1.55;
    margin-bottom: 32px;
    text-align: left;
  }

  label {
    display: block;
    text-align: left;
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 500;
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
    transition: border-color var(--t);
  }
  input:focus { border-color: var(--accent); outline: none; }

  /* ── OTP code input ────────────────────────────── */
  .code-input {
    font-family: var(--ff-mono) !important;
    font-size: 32px !important;
    font-weight: 500 !important;
    letter-spacing: 0.5em !important;
    text-align: center !important;
    padding: 18px 16px !important;
  }

  /* ── Buttons ─────────────────────────────────── */
  .btn {
    width: 100%;
    padding: 14px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: none;
    cursor: pointer;
    transition: background var(--t), color var(--t), transform var(--t);
  }
  .btn.primary {
    background: var(--accent);
    color: var(--bg);
  }
  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
  .btn.primary:disabled { opacity: 0.45; cursor: not-allowed; }

  .link-btn {
    color: var(--accent);
    font-family: var(--ff-display);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 2px;
    background: none;
    border: none;
    cursor: pointer;
    transition: color var(--t);
  }
  .link-btn:hover { color: var(--ink); }
  .link-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .link-btn.muted {
    color: var(--ink-3);
    font-size: 12px;
    text-decoration: none;
  }
  .link-btn.muted:hover { color: var(--ink-2); }

  /* ── Error ──────────────────────────────────── */
  .error {
    margin: 0 0 18px;
    padding: 12px 14px;
    background: rgba(198, 74, 74, 0.08);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    color: var(--danger);
    font-family: var(--ff-display);
    font-size: 14px;
    text-align: left;
    line-height: 1.5;
  }

  /* ── Legal ──────────────────────────────────── */
  .legal {
    margin-top: 30px;
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.5;
    text-align: center;
  }
  .legal a { color: var(--ink-2); border-bottom: 1px solid var(--groove); }
  .legal a:hover { color: var(--accent); border-color: var(--accent); }

  /* ── Code state ─────────────────────────────── */
  .code-state { text-align: center; }
  .code-icon {
    width: 56px; height: 56px;
    margin: 0 auto 20px;
    color: var(--accent);
  }
  .code-icon svg { width: 100%; height: 100%; }
  h1 {
    font-family: var(--ff-display);
    font-size: 30px;
    font-weight: 400;
    color: var(--ink);
    margin-bottom: 12px;
  }
  .code-sub {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 15px;
    color: var(--ink-2);
    margin-bottom: 20px;
    line-height: 1.5;
  }
  .code-sub strong { color: var(--ink); font-style: normal; }

  .hint {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
  }

  .resend-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
    flex-wrap: wrap;
  }
  .resend-hint {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.06em;
  }
  .sep { color: var(--groove); font-size: 13px; }

  .switch-method-row {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--groove);
  }

  /* ── Success (magic link sent) ───────────────── */
  .success-state { text-align: center; }
  .check {
    width: 56px; height: 56px;
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
    font-family: var(--ff-display);
  }
  .success-state strong { color: var(--ink); }
</style>
