<script>
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  const isReturningUser = $derived(data.isReturningUser);

  let agreed = $state(false);
  let submitting = $state(false);
</script>

<svelte:head>
  <title>{isReturningUser ? 'Updated Terms · Hyllah' : 'Welcome · Hyllah'}</title>
</svelte:head>

<main class="welcome-page">
  <div class="welcome-card">
    <div class="brand-mark">Hyl<em>lah</em></div>

    {#if isReturningUser}
      <h1>We've updated our Terms</h1>
      <p class="intro">
        Our Terms of Service or Privacy Policy have changed. Please review and
        accept the new version to continue using Hyllah.
      </p>
    {:else}
      <h1>Welcome to Hyllah</h1>
      <p class="intro">
        A quiet place for your music collection. Before we get started, please
        read and agree to our terms.
      </p>
    {/if}

    <form
      method="POST"
      action="?/accept"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}
    >
      <label class="check-row">
        <input
          type="checkbox"
          name="agreed"
          bind:checked={agreed}
          disabled={submitting}
        />
        <span class="check-label">
          I have read and agree to the
          <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>
          and
          <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
        </span>
      </label>

      {#if form?.error}
        <p class="error">{form.error}</p>
      {/if}

      <div class="actions">
        <button
          type="submit"
          class="btn primary"
          disabled={!agreed || submitting}
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>

    <form method="POST" action="/app/signout" class="signout-form">
      <button type="submit" class="link-btn">Sign out instead</button>
    </form>
  </div>
</main>

<style>
  .welcome-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    background: var(--bg);
  }
  .welcome-card {
    width: 100%;
    max-width: 480px;
    padding: 40px;
    background: var(--surface);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }
  .brand-mark {
    font-family: var(--ff-display);
    font-size: 32px;
    font-weight: 500;
    text-align: center;
    margin-bottom: 28px;
    color: var(--ink);
  }
  .brand-mark em {
    font-style: italic;
    color: var(--accent);
    font-weight: 400;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: 24px;
    font-weight: 500;
    margin: 0 0 12px;
    color: var(--ink);
  }
  .intro {
    font-family: var(--ff-display);
    font-size: 15px;
    line-height: 1.55;
    color: var(--ink-2);
    margin: 0 0 28px;
  }

  .check-row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 16px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    cursor: pointer;
    margin-bottom: 16px;
  }
  .check-row input[type='checkbox'] {
    flex-shrink: 0;
    margin-top: 2px;
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .check-label {
    font-family: var(--ff-display);
    font-size: 14px;
    line-height: 1.5;
    color: var(--ink);
  }
  .check-label a {
    color: var(--accent);
    text-decoration: underline;
  }
  .check-label a:hover { opacity: 0.85; }

  .error {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--danger);
    margin: 0 0 16px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
  }
  .signout-form {
    margin-top: 16px;
    text-align: center;
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--ink-3);
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 8px 0;
    transition: color var(--t);
  }
  .link-btn:hover { color: var(--ink); }

  .btn {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--bg);
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 12px 24px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: filter var(--t);
  }
  .btn:hover:not(:disabled) { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 520px) {
    .welcome-card { padding: 28px 24px; }
    .actions { justify-content: stretch; }
    .btn { width: 100%; }
  }
</style>
