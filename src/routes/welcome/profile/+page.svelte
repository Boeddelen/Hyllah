<script>
  import { enhance } from '$app/forms';

  let { data, form } = $props();

  let displayName = $state(form?.displayName ?? '');
  let username = $state(form?.usernameInput ?? data.username ?? '');
  let submitting = $state(false);

  // Live-format the username: lowercase, strip disallowed chars.
  function onUsernameInput(e) {
    const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (cleaned !== e.target.value) {
      username = cleaned;
    } else {
      username = e.target.value;
    }
  }
</script>

<svelte:head>
  <title>Set up your profile · Hyllah</title>
</svelte:head>

<main class="welcome-page">
  <div class="welcome-card">
    <div class="brand-mark">Hyl<em>lah</em></div>

    <h1>What should we call you?</h1>
    <p class="intro">
      Your display name is what other Hyllah users see. You can change it later.
    </p>

    <form
      method="POST"
      action="?/save"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}
    >
      <div class="field">
        <label for="display_name" class="field-label">Display name</label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          bind:value={displayName}
          maxlength="60"
          required
          autocomplete="name"
          class="field-input"
          placeholder="e.g. Alex Hansen"
          disabled={submitting}
        />
      </div>

      <div class="field">
        <label for="username" class="field-label">
          Handle <span class="optional">(optional)</span>
        </label>
        <div class="username-wrap">
          <span class="username-prefix">@</span>
          <input
            id="username"
            name="username"
            type="text"
            value={username}
            oninput={onUsernameInput}
            maxlength="30"
            autocomplete="username"
            class="field-input username-input"
            placeholder="alex"
            disabled={submitting}
          />
        </div>
        <p class="hint">
          Only needed if you make your profile public. Lowercase letters, numbers,
          dashes or underscores. 3–30 characters.
        </p>
      </div>

      {#if form?.error}
        <p class="error">{form.error}</p>
      {/if}

      <div class="actions">
        <button
          type="submit"
          class="btn primary"
          disabled={!displayName.trim() || submitting}
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </div>
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

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 20px;
  }
  .field-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .optional {
    text-transform: none;
    letter-spacing: normal;
    font-size: 11px;
    color: var(--ink-3);
    font-weight: 400;
  }
  .field-input {
    padding: 12px 14px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    color: var(--ink);
    font-family: var(--ff-display);
    font-size: 15px;
    outline: none;
    transition: border-color var(--t);
  }
  .field-input:focus { border-color: var(--accent); }
  .field-input::placeholder { color: var(--ink-3); }
  .field-input:disabled { opacity: 0.6; }

  .username-wrap {
    display: flex;
    align-items: center;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color var(--t);
  }
  .username-wrap:focus-within { border-color: var(--accent); }
  .username-prefix {
    padding: 0 0 0 14px;
    color: var(--ink-3);
    font-family: var(--ff-mono);
    font-size: 15px;
  }
  .username-input {
    background: none;
    border: none;
    padding-left: 2px;
  }
  .username-input:focus { box-shadow: none; }

  .hint {
    font-family: var(--ff-display);
    font-size: 12px;
    color: var(--ink-3);
    margin: 2px 0 0;
    line-height: 1.5;
  }
  .error {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--danger);
    margin: 0 0 12px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
  }
  .btn {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--bg);
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 12px 28px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: filter var(--t);
  }
  .btn:hover:not(:disabled) { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 520px) {
    .welcome-card { padding: 28px 24px; }
    .btn { width: 100%; }
    .actions { justify-content: stretch; }
  }
</style>
