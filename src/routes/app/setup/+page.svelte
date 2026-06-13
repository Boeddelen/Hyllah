<script>
  import { enhance } from '$app/forms';
  import { COLLECTION_ICONS } from '$lib/formats';

  let { form } = $props();

  let name = $state(form?.name ?? 'My Collection');
  let icon = $state(form?.icon ?? '💿');
  let submitting = $state(false);
</script>

<svelte:head>
  <title>Welcome — Hyllah</title>
</svelte:head>

<div class="setup">
  <div class="setup-inner">
    <div class="eyebrow">Welcome</div>
    <h1>Let's <em>begin</em>.</h1>
    <p class="lede">
      Every record you catalog will live inside a collection. You can have as many as you like —
      "Main collection", "For sale", "Wishlist", "Dad's records", anything. Let's create your first
      one. You can always rename it later.
    </p>

    <form
      method="POST"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          await update();
          submitting = false;
        };
      }}
    >
      <div class="field">
        <label for="name">What should we call it?</label>
        <input
          id="name"
          name="name"
          type="text"
          bind:value={name}
          maxlength="60"
          required
          autofocus
        />
      </div>

      <div class="field">
        <label>Pick an icon</label>
        <div class="icon-grid">
          {#each COLLECTION_ICONS as opt}
            <button
              type="button"
              class="icon-btn"
              class:active={icon === opt}
              onclick={() => (icon = opt)}
              aria-label="Use {opt}"
            >
              {opt}
            </button>
          {/each}
        </div>
        <input type="hidden" name="icon" value={icon} />
      </div>

      {#if form?.error}
        <div class="error">{form.error}</div>
      {/if}

      <button type="submit" class="btn primary" disabled={submitting || !name.trim()}>
        {submitting ? 'Creating...' : 'Create collection →'}
      </button>
    </form>

    <p class="hint">
      You can create more collections later from <em>Manage collections</em> in the sidebar.
    </p>
  </div>
</div>

<style>
  .setup {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 32px;
  }

  .setup-inner {
    max-width: 560px;
    width: 100%;
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
    font-size: clamp(48px, 7vw, 80px);
    font-weight: 400;
    line-height: 0.95;
    margin-bottom: 24px;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .lede {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 18px;
    color: var(--ink-2);
    line-height: 1.6;
    margin-bottom: 50px;
  }

  .field {
    margin-bottom: 32px;
  }

  label {
    display: block;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 10px;
  }

  input[type='text'] {
    width: 100%;
    padding: 14px 16px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-size: 18px;
    color: var(--ink);
  }

  input[type='text']:focus {
    border-color: var(--accent);
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 6px;
  }

  .icon-btn {
    aspect-ratio: 1;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-size: 22px;
    transition:
      background var(--t),
      border-color var(--t),
      transform var(--t);
  }

  .icon-btn:hover {
    background: var(--surface);
    border-color: var(--ink-3);
  }

  .icon-btn.active {
    background: var(--accent-glow);
    border-color: var(--accent);
    transform: scale(1.05);
  }

  .error {
    background: rgba(198, 74, 74, 0.1);
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 12px;
    border-radius: var(--radius);
    margin-bottom: 18px;
    font-size: 13px;
  }

  .btn {
    width: 100%;
    padding: 16px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    transition:
      background var(--t),
      transform var(--t);
  }

  .btn.primary {
    background: var(--accent);
    color: var(--bg);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--ink);
    transform: translateY(-1px);
  }

  .btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    margin-top: 30px;
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-3);
    text-align: center;
  }
</style>
