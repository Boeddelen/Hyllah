<svelte:head>
  <title>Terms of Service — Hyllah</title>
  <meta name="description" content="The terms under which Hyllah is provided." />
</svelte:head>

<main class="legal-page">
  <a href="/" class="back-link">← Back</a>

  <article>
    <header>
      <div class="brand-mark">Hyl<em>lah</em></div>
      <h1>Terms of <em>Service</em></h1>
      <div class="meta">Last updated: 12 May 2026 · Effective: 12 May 2026</div>
    </header>

    <section>
      <p class="lede">
        These are the terms under which Hyllah is provided. By creating an account, you
        agree to them. They're written to be readable, not impenetrable.
      </p>
    </section>

    <section>
      <h2>What Hyllah is</h2>
      <p>
        Hyllah is a free, open-source web service for cataloging music collections. It is
        operated by Frederik Flakne, a private individual based in Norway. You can find the source
        code at <a href="https://github.com/Boeddelen/Hyllah" target="_blank" rel="noopener">github.com/Boeddelen/Hyllah</a>
        under the MIT License.
      </p>
    </section>

    <section>
      <h2>Your account</h2>
      <ul>
        <li>You must provide a valid email address to sign up</li>
        <li>You are responsible for the security of the email account you sign up with (since magic-link login depends on it)</li>
        <li>One person, one account — don't create multiple accounts to evade rate limits or bans</li>
        <li>You must be at least 16 years old, or have your parent or guardian's permission</li>
      </ul>
    </section>

    <section>
      <h2>Your content</h2>
      <p>
        You retain full ownership of everything you put into Hyllah — your collection data,
        notes, custom fields, images, and so on. We claim no rights over your content.
      </p>
      <p>
        By uploading content, you grant Hyllah a limited license to store, process, and
        display it solely for the purpose of providing the service to you (and to other users if
        you make your profile public). This license ends when you delete the content or your
        account.
      </p>
      <p>You are responsible for ensuring you have the right to upload anything you upload, including cover-art images.</p>
    </section>

    <section>
      <h2>Acceptable use</h2>
      <p>Don't use Hyllah to:</p>
      <ul>
        <li>Violate the law or anyone's rights</li>
        <li>Upload content that's illegal, harassing, or hateful</li>
        <li>Attempt to break into other users' accounts</li>
        <li>Probe, scan, or otherwise try to compromise the service's security</li>
        <li>Scrape data at scale (use the export feature instead)</li>
        <li>Send spam or unsolicited messages</li>
      </ul>
      <p>
        Violations may result in account suspension or termination. We reserve the right to
        remove specific content that violates these terms.
      </p>
    </section>

    <section>
      <h2>Service availability</h2>
      <p>
        Hyllah is provided "as is" and "as available." We try our best to keep it running
        reliably but we don't guarantee uptime. As a free service operated by an individual:
      </p>
      <ul>
        <li>Occasional downtime for maintenance or unexpected issues will happen</li>
        <li>We may add, change, or remove features without notice</li>
        <li>We may temporarily restrict access if needed for security or operational reasons</li>
        <li>We don't promise the service will be available forever</li>
      </ul>
      <p>
        If Hyllah is ever shut down, we will give at least 30 days' notice and provide a
        way to export all your data.
      </p>
    </section>

    <section>
      <h2>Pricing and the tip jar</h2>
      <p>
        Hyllah is free to use. There are no paid tiers and no plans to introduce them.
        We may, in the future, add optional paid features — but core functionality (the
        collection manager) will remain free.
      </p>
      <p>
        Tips via PayPal are voluntary, non-refundable, and grant no special privileges, rights,
        or benefits. They're just a way to say thanks if you want to.
      </p>
    </section>

    <section>
      <h2>Liability</h2>
      <p>
        To the maximum extent permitted by law, Hyllah and its operator are not liable
        for any direct, indirect, incidental, or consequential damages arising from your use
        of the service. This includes (but is not limited to) loss of data, loss of profit,
        or any inability to use the service.
      </p>
      <p>
        We take reasonable steps to back up your data, but ultimately you are responsible for
        keeping your own backups (use the export feature regularly if your collection is
        irreplaceable to you).
      </p>
      <p>
        Note: nothing in these terms is intended to limit your statutory rights as a consumer
        under Norwegian or EU law.
      </p>
    </section>

    <section>
      <h2>Termination</h2>
      <p>
        You can delete your account at any time from your settings page, or by emailing
        <a href="mailto:privacy@hyllah.com">privacy@hyllah.com</a>. Deletion is
        permanent and removes all your data within 30 days.
      </p>
      <p>
        We may terminate accounts that violate these terms, with as much notice as the
        circumstances permit.
      </p>
    </section>

    <section>
      <h2>Changes to these terms</h2>
      <p>
        We may update these terms occasionally. If we make material changes, we'll notify
        active users by email and update the "Last updated" date above. Continued use after
        changes constitutes acceptance.
      </p>
    </section>

    <section>
      <h2>Governing law</h2>
      <p>
        These terms are governed by Norwegian law. Any disputes will be resolved in the courts
        of Norway, subject to your statutory rights as a consumer under EU law.
      </p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:hello@hyllah.com">hello@hyllah.com</a><br>
        Privacy/GDPR: <a href="mailto:privacy@hyllah.com">privacy@hyllah.com</a>
      </p>
    </section>
  </article>
</main>

<style>
  /* same styles as privacy page — keeps things consistent */
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

  ul {
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
