<script>
  import { page } from '$app/stores';

  // Only show raw error detail when ?debug=1 is in the URL.
  // Keeps production clean while allowing on-demand diagnosis.
  const showDebug = $derived($page.url.searchParams.get('debug') === '1');
</script>

<svelte:head>
  <title>{$page.status} — Hyllah</title>
</svelte:head>

<main class="error-page">
  <a href="/" class="back-link">← Back to start</a>

  <div class="content">
    <div class="brand-mark">Hyl<em>lah</em></div>

    <div class="status-code">{$page.status}</div>

    {#if $page.status === 404}
      <h1>This shelf is <em>empty</em>.</h1>
      <p>
        The page you're looking for isn't here. Maybe it never was. Maybe it moved.
        Either way, the door back is open.
      </p>
    {:else if $page.status >= 500}
      <h1>Something <em>skipped</em>.</h1>
      <p>
        An unexpected error occurred. Head back home or try again in a moment.
      </p>
      {#if showDebug}
        <pre class="error-detail">{$page.status}: {$page.error?.message ?? 'No message'}</pre>
      {/if}
    {:else}
      <h1>Couldn't <em>open</em> that.</h1>
      <p>{$page.error?.message ?? 'An unknown error occurred.'}</p>
    {/if}

    <a href="/" class="btn">Return to start →</a>
  </div>
</main>

<style>
  .error-page {
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
  .back-link:hover { color: var(--accent); }
  .content {
    max-width: 520px;
    text-align: center;
  }
  .brand-mark {
    font-family: var(--ff-display);
    font-size: 24px;
    font-weight: 500;
    margin-bottom: 60px;
  }
  .brand-mark em {
    font-style: italic;
    color: var(--accent);
  }
  .status-code {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.3em;
    color: var(--ink-3);
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: clamp(48px, 8vw, 84px);
    font-weight: 400;
    line-height: 0.95;
    margin-bottom: 30px;
  }
  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }
  p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 18px;
    color: var(--ink-2);
    line-height: 1.55;
    margin-bottom: 50px;
  }
  .error-detail {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--danger);
    background: var(--bg-2);
    border: 1px solid var(--danger);
    border-radius: var(--radius);
    padding: 12px 16px;
    margin-bottom: 40px;
    text-align: left;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .btn {
    display: inline-flex;
    padding: 14px 26px;
    background: var(--accent);
    color: var(--bg);
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition: background var(--t), transform var(--t);
  }
  .btn:hover {
    background: var(--ink);
    transform: translateY(-1px);
  }
</style>
