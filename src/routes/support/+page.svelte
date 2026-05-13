<script>
  import { env } from '$env/static/public';
  const { PUBLIC_PAYPAL_ME_LINK } = env;

  let { data } = $props();

  async function recordTipClick() {
    // Anonymous counter — no personal data stored
    try {
      await data.supabase.from('tip_jar_clicks').insert({});
    } catch (e) {
      // Silently ignore — analytics, not critical
    }
  }
</script>

<svelte:head>
  <title>Support Retro Vault — Tip jar</title>
  <meta
    name="description"
    content="Retro Vault is free forever. If you'd like to chip in, the tip jar is here."
  />
</svelte:head>

<main class="support-page">
  <a href="/" class="back-link">← Back</a>

  <div class="content">
    <div class="brand-mark">Retro <em>Vault</em></div>
    <div class="brand-sub">Tip jar</div>

    <h1>If it's <em>helpful</em>,<br />a tip is appreciated.</h1>

    <p class="lede">
      Retro Vault is free forever. No tiers, no upsell, no premium. It runs on a small server in
      Zürich and the bills are modest, but they're real. If you've found this useful and want
      to chip in, the jar is here.
    </p>

    <div class="cta-row">
      {#if PUBLIC_PAYPAL_ME_LINK}
        <a
          href={PUBLIC_PAYPAL_ME_LINK}
          target="_blank"
          rel="noopener"
          class="btn primary"
          onclick={recordTipClick}
        >
          Open PayPal tip jar →
        </a>
      {:else}
        <span class="btn primary disabled">Tip jar coming soon</span>
      {/if}
    </div>

    <div class="alt-support">
      <div class="alt-eyebrow">Other ways to help</div>
      <ul>
        <li>
          <strong>Star the repo</strong> on
          <a href="https://github.com/Boeddelen/RetroVault" target="_blank" rel="noopener">GitHub</a>.
          Helps others find the project.
        </li>
        <li>
          <strong>Tell a friend</strong> who collects records. Word of mouth is everything.
        </li>
        <li>
          <strong>Report bugs and request features</strong> via
          <a href="https://github.com/Boeddelen/RetroVault/issues" target="_blank" rel="noopener">
            GitHub Issues
          </a>.
        </li>
        <li>
          <strong>Self-host it</strong> if you'd rather run your own copy. The code is open.
        </li>
      </ul>
    </div>

    <p class="thanks">Thank you for being here. — Frederik</p>
  </div>
</main>

<style>
  .support-page {
    min-height: 100vh;
    padding: 80px 32px 60px;
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

  .content {
    max-width: 640px;
    margin: 0 auto;
    text-align: center;
  }

  .brand-mark {
    font-family: var(--ff-display);
    font-size: 28px;
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
    margin-bottom: 60px;
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(40px, 6.5vw, 72px);
    font-weight: 400;
    line-height: 0.95;
    letter-spacing: -0.01em;
    margin-bottom: 32px;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .lede {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: clamp(17px, 2vw, 20px);
    color: var(--ink-2);
    line-height: 1.6;
    margin-bottom: 44px;
  }

  .cta-row {
    margin-bottom: 60px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    padding: 16px 30px;
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

  .btn.primary:hover {
    background: var(--ink);
    transform: translateY(-1px);
  }

  .btn.disabled {
    background: var(--bg-3);
    color: var(--ink-3);
    cursor: not-allowed;
  }

  .alt-support {
    margin-top: 60px;
    padding-top: 40px;
    border-top: 1px solid var(--groove);
    text-align: left;
  }

  .alt-eyebrow {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 18px;
    text-align: center;
  }

  .alt-support ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .alt-support li {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink-2);
    line-height: 1.55;
    padding-left: 20px;
    position: relative;
  }

  .alt-support li::before {
    content: '·';
    position: absolute;
    left: 0;
    color: var(--accent);
    font-weight: bold;
  }

  .alt-support strong {
    color: var(--ink);
    font-weight: 500;
  }

  .alt-support a {
    color: var(--accent);
    border-bottom: 1px solid transparent;
  }

  .alt-support a:hover {
    border-color: var(--accent);
  }

  .thanks {
    margin-top: 50px;
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-3);
    text-align: center;
  }
</style>
