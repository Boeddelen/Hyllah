<script>
  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();
</script>

<svelte:head>
  <title>Retro Vault — a quiet place for your music collection</title>
</svelte:head>

<main>
  <div class="hero">
    <div class="hero-inner">
      <div class="brand">
        <div class="brand-mark">
          Retro <em>Vault</em>
        </div>
        <div class="brand-sub">Est. 2026 · A listening room</div>
      </div>

      <h1>A quiet place<br />for your <em>music collection</em>.</h1>

      <p class="lede">
        Catalog your vinyl, CDs, cassettes, and rarities. Track what you paid and what they're worth.
        Own your data — sync if you want, self-host if you prefer.
      </p>

      <div class="cta-row">
        {#if data.user}
          <a href="/app" class="btn primary">Open Your Vault →</a>
        {:else}
          <a href="/login" class="btn primary">Sign in with email →</a>
        {/if}
        <a href="#features" class="btn ghost">Learn more</a>
      </div>

      <div class="trust-row">
        <span>No passwords</span>
        <span class="dot">·</span>
        <span>EU-hosted</span>
        <span class="dot">·</span>
        <span>Open source</span>
        <span class="dot">·</span>
        <span>Free</span>
      </div>
    </div>
  </div>

  <section id="features" class="features">
    <div class="features-inner">
      <div class="section-eyebrow">What's inside</div>
      <h2>Built for <em>collectors</em>, not subscribers.</h2>

      <div class="feature-grid">
        <div class="feature">
          <div class="feature-num">01</div>
          <h3>Live Discogs prices</h3>
          <p>
            Search the Discogs database, auto-fill metadata, and see live market prices for every
            condition grade — without leaving your shelf.
          </p>
        </div>

        <div class="feature">
          <div class="feature-num">02</div>
          <h3>Multiple collections</h3>
          <p>
            Keep "For Sale", "Personal", "Wishlist", or "Dad's records" separate. Each one gets its
            own name, icon, and view.
          </p>
        </div>

        <div class="feature">
          <div class="feature-num">03</div>
          <h3>Your data is yours</h3>
          <p>
            Export to JSON anytime. Self-host the whole app on your own server with one Docker
            command. Delete your account and we forget you.
          </p>
        </div>

        <div class="feature">
          <div class="feature-num">04</div>
          <h3>Private by default</h3>
          <p>
            Nothing is public until you say so. When you do share, you control whether values are
            shown — your shelf isn't a sales catalog unless you want it to be.
          </p>
        </div>

        <div class="feature">
          <div class="feature-num">05</div>
          <h3>GDPR clean</h3>
          <p>
            Built in Norway, hosted in Frankfurt. Magic-link login means we never store your password
            because there isn't one. No tracking cookies.
          </p>
        </div>

        <div class="feature">
          <div class="feature-num">06</div>
          <h3>Free</h3>
          <p>
            No tier, no upsell, no "premium". If you find it useful and want to chip in, there's a
            tip jar. If you don't, that's fine too.
          </p>
        </div>
      </div>
    </div>
  </section>

  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <div class="brand-mark small">Retro <em>Vault</em></div>
        <div class="footer-tag">A quiet place for your music collection.</div>
      </div>
      <nav class="footer-nav">
        <div class="footer-col">
          <div class="footer-label">Product</div>
          <a href="/login">Sign in</a>
          <a href="/about">About</a>
          <a href="/support">Tip jar</a>
        </div>
        <div class="footer-col">
          <div class="footer-label">Open source</div>
          <a href="https://github.com/Boeddelen/RetroVault" target="_blank" rel="noopener">GitHub</a>
          <a href="/self-host">Self-host</a>
        </div>
        <div class="footer-col">
          <div class="footer-label">Legal</div>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/gdpr">GDPR</a>
        </div>
      </nav>
      <div class="footer-copy">
        © 2026 Retro Vault. Made in Norway.
      </div>
    </div>
  </footer>
</main>

<style>
  /* ── Hero ──────────────────────────────────────────────── */
  .hero {
    min-height: 92vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 32px;
    position: relative;
    overflow: hidden;
  }

  .hero::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 35%, var(--bg-2) 0%, var(--bg) 70%);
    z-index: 0;
  }

  .hero-inner {
    position: relative;
    z-index: 2;
    max-width: 920px;
    width: 100%;
    text-align: center;
  }

  .brand {
    margin-bottom: 80px;
  }

  .brand-mark {
    font-family: var(--ff-display);
    font-size: 32px;
    font-weight: 500;
    letter-spacing: 0.01em;
    line-height: 1;
  }

  .brand-mark em {
    font-style: italic;
    color: var(--accent);
  }

  .brand-mark.small {
    font-size: 22px;
  }

  .brand-sub {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-top: 10px;
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(48px, 8vw, 92px);
    font-weight: 400;
    line-height: 0.95;
    letter-spacing: -0.015em;
    margin-bottom: 28px;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .lede {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: clamp(18px, 2.4vw, 22px);
    color: var(--ink-2);
    line-height: 1.55;
    max-width: 620px;
    margin: 0 auto 44px;
  }

  .cta-row {
    display: flex;
    gap: 14px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 40px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    padding: 14px 26px;
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

  .btn.primary:hover {
    background: var(--ink);
    transform: translateY(-1px);
  }

  .btn.ghost {
    color: var(--ink-2);
    border: 1px solid var(--groove);
  }

  .btn.ghost:hover {
    color: var(--ink);
    border-color: var(--ink-3);
  }

  .trust-row {
    display: flex;
    justify-content: center;
    gap: 12px;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    flex-wrap: wrap;
  }

  .trust-row .dot {
    opacity: 0.5;
  }

  /* ── Features ──────────────────────────────────────────── */
  .features {
    padding: 100px 32px 120px;
    background: var(--bg-2);
    border-top: 1px solid var(--groove);
  }

  .features-inner {
    max-width: 1100px;
    margin: 0 auto;
  }

  .section-eyebrow {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 16px;
  }

  h2 {
    font-family: var(--ff-display);
    font-size: clamp(36px, 5.5vw, 64px);
    font-weight: 400;
    line-height: 0.95;
    margin-bottom: 60px;
    max-width: 14ch;
  }

  h2 em {
    font-style: italic;
    color: var(--accent);
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 36px 44px;
  }

  .feature {
    padding-top: 18px;
    border-top: 1px solid var(--groove);
  }

  .feature-num {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--accent);
    margin-bottom: 12px;
  }

  .feature h3 {
    font-family: var(--ff-display);
    font-size: 26px;
    font-weight: 500;
    line-height: 1.1;
    margin-bottom: 10px;
  }

  .feature p {
    font-size: 15px;
    color: var(--ink-2);
    line-height: 1.6;
  }

  /* ── Footer ────────────────────────────────────────────── */
  .site-footer {
    padding: 60px 32px 40px;
    border-top: 1px solid var(--groove);
  }

  .footer-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 40px;
    align-items: start;
  }

  .footer-tag {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-3);
    margin-top: 10px;
  }

  .footer-nav {
    display: flex;
    gap: 48px;
  }

  .footer-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .footer-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 6px;
  }

  .footer-col a {
    font-size: 14px;
    color: var(--ink-2);
  }

  .footer-col a:hover {
    color: var(--accent);
  }

  .footer-copy {
    grid-column: 1 / -1;
    padding-top: 30px;
    margin-top: 20px;
    border-top: 1px solid var(--groove);
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.05em;
    text-align: center;
  }

  @media (max-width: 720px) {
    .brand {
      margin-bottom: 40px;
    }
    .lede {
      font-size: 17px;
    }
    .features {
      padding: 60px 22px 80px;
    }
    h2 {
      margin-bottom: 36px;
    }
    .feature-grid {
      gap: 28px;
    }
    .footer-inner {
      grid-template-columns: 1fr;
    }
    .footer-nav {
      flex-direction: column;
      gap: 24px;
    }
  }
</style>
