<svelte:head>
  <title>Your GDPR Rights — Hyllah</title>
  <meta name="description" content="How to exercise your data rights under GDPR." />
</svelte:head>

<main class="legal-page">
  <a href="/" class="back-link">← Back</a>

  <article>
    <header>
      <div class="brand-mark">Hyl<em>lah</em></div>
      <h1>Your <em>GDPR</em> rights</h1>
      <div class="meta">Last updated: 12 May 2026</div>
    </header>

    <section>
      <p class="lede">
        Under the EU General Data Protection Regulation (GDPR) and Norwegian law, you have
        specific rights regarding the personal data we hold about you. This page explains what
        they are and how to exercise them.
      </p>
      <p class="lede">
        For most of these, the fastest path is your <a href="/app/settings">account settings page</a>.
        For anything that needs a human, email <a href="mailto:privacy@hyllah.com">privacy@hyllah.com</a>
        and we'll respond within 30 days (usually much faster).
      </p>
    </section>

    <section>
      <h2>Right of access</h2>
      <p>
        You have the right to know what personal data we hold about you. You can see most of it
        directly in your account settings. For a complete machine-readable export of everything,
        use the <strong>"Export my data"</strong> button on your settings page (coming soon — for
        now, email us).
      </p>
    </section>

    <section>
      <h2>Right to rectification</h2>
      <p>
        If any of your personal data is wrong, you can correct most of it yourself in your
        account settings. For things you can't edit directly, email us.
      </p>
    </section>

    <section>
      <h2>Right to erasure ("right to be forgotten")</h2>
      <p>
        You can delete your account and all associated personal data at any time:
      </p>
      <ul>
        <li><strong>Self-service:</strong> account settings → "Delete my account"</li>
        <li><strong>By email:</strong> contact <a href="mailto:privacy@hyllah.com">privacy@hyllah.com</a> from the email address on your account</li>
      </ul>
      <p>
        Deletion is permanent. We erase your data from our active systems immediately and from
        backups within 30 days. Anonymous, aggregated analytics that can't identify you may be
        retained.
      </p>
    </section>

    <section>
      <h2>Right to data portability</h2>
      <p>
        You can export your collection and account data in a portable JSON format from your
        settings page (coming soon — for now, email us). The format is documented in our
        <a href="https://github.com/Boeddelen/Hyllah" target="_blank" rel="noopener">open-source repository</a>
        so you can import it into other tools.
      </p>
    </section>

    <section>
      <h2>Right to object</h2>
      <p>
        You can object to specific processing of your data — for example, anonymous analytics
        collection. Contact <a href="mailto:privacy@hyllah.com">privacy@hyllah.com</a> and
        tell us what you'd like to opt out of.
      </p>
    </section>

    <section>
      <h2>Right to restrict processing</h2>
      <p>
        You can ask us to temporarily stop processing your data while a dispute is being
        resolved (e.g. if you believe data is inaccurate, while we verify it).
      </p>
    </section>

    <section>
      <h2>Right to withdraw consent</h2>
      <p>
        Most of our processing is based on the contract between us (you signed up; we provide the
        service). For anything based on your consent, you can withdraw it at any time without
        affecting the lawfulness of past processing.
      </p>
    </section>

    <section>
      <h2>Right to lodge a complaint</h2>
      <p>
        If you believe we've handled your data improperly, you can complain to:
      </p>
      <p>
        <strong>Datatilsynet</strong> (the Norwegian Data Protection Authority)<br>
        Web: <a href="https://www.datatilsynet.no" target="_blank" rel="noopener">datatilsynet.no</a><br>
        Postal: Postboks 458 Sentrum, 0105 Oslo, Norway<br>
        Phone: +47 22 39 69 00
      </p>
      <p>
        We'd appreciate the chance to address your concerns first if you haven't already
        emailed us.
      </p>
    </section>

    <section>
      <h2>How to make a request</h2>
      <p>
        For most rights, the fastest path is your account settings. For anything else:
      </p>
      <ol>
        <li>Email <a href="mailto:privacy@hyllah.com">privacy@hyllah.com</a> from the address on your account</li>
        <li>Tell us which right you want to exercise and what you'd like</li>
        <li>We respond within 30 days (usually within 1-2 business days)</li>
        <li>If we need to verify your identity, we'll let you know</li>
        <li>The service is free — we won't charge you for exercising your rights</li>
      </ol>
    </section>

    <section>
      <h2>More info</h2>
      <p>
        See the full <a href="/privacy">Privacy Policy</a> for details on what we collect, why,
        and where it lives.
      </p>
    </section>
  </article>
</main>

<style>
  /* same as other legal pages */
  .legal-page {
    min-height: 100vh;
    padding: 80px 32px 80px;
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

  article {
    max-width: 720px;
    margin: 0 auto;
  }

  header {
    text-align: center;
    margin-bottom: 80px;
    padding-bottom: 40px;
    border-bottom: 1px solid var(--groove);
  }

  .brand-mark {
    font-family: var(--ff-display);
    font-size: 24px;
    font-weight: 500;
    margin-bottom: 40px;
  }

  .brand-mark em {
    font-style: italic;
    color: var(--accent);
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(44px, 7vw, 76px);
    font-weight: 400;
    line-height: 0.95;
    margin-bottom: 16px;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .meta {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  section {
    margin-bottom: 50px;
  }

  h2 {
    font-family: var(--ff-display);
    font-size: 28px;
    font-weight: 500;
    margin-bottom: 18px;
    color: var(--ink);
  }

  p,
  li {
    font-size: 16px;
    color: var(--ink-2);
    line-height: 1.65;
    margin-bottom: 14px;
  }

  .lede {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 18px;
    color: var(--ink-2);
  }

  ul,
  ol {
    padding-left: 22px;
    margin-bottom: 18px;
  }

  li {
    margin-bottom: 8px;
  }

  strong {
    color: var(--ink);
    font-weight: 500;
  }

  a {
    color: var(--accent);
    border-bottom: 1px solid transparent;
    transition: border-color var(--t);
  }

  a:hover {
    border-color: var(--accent);
  }
</style>
