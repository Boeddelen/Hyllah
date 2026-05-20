<script>
  import { FORMATS, CONDITIONS } from '$lib/formats';
  import { formatCurrency } from '$lib/currency.js';

  let { data } = $props();
  let { stats } = $derived(data);

  // User currency preferences from app layout server load
  let displayCurrency = $derived(data.displayCurrency ?? 'EUR');
  let rates = $derived(data.rates ?? { EUR: 1 });

  function toDisplay(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return n;
    if (displayCurrency === 'EUR') return n;
    const target = rates[displayCurrency];
    if (!target) return n;
    return n * target;
  }

  function fmtPrice(n) {
    if (!Number.isFinite(n) || n === 0) return formatCurrency(0, displayCurrency, { compact: true });
    return formatCurrency(toDisplay(n), displayCurrency, { compact: true });
  }

  function fmtPriceDecimal(n) {
    if (!Number.isFinite(n) || n === 0) return formatCurrency(0, displayCurrency);
    return formatCurrency(toDisplay(n), displayCurrency);
  }

  let net = $derived(stats.totalValue - stats.totalPaid);
  let netPct = $derived(stats.totalPaid > 0 ? (net / stats.totalPaid) * 100 : 0);

  // Condition order from worst to best, for chart display
  const CONDITION_ORDER = ['P', 'F', 'G', 'G_PLUS', 'VG', 'VG_PLUS', 'NM', 'M'];

  // Build a sorted, normalized chart series
  function buildBars(counts, labelMap, order) {
    const entries = order
      ? order
          .filter((k) => counts[k] != null && counts[k] > 0)
          .map((k) => ({ key: k, label: labelMap?.[k]?.label ?? labelMap?.[k] ?? k, count: counts[k] }))
      : Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, count]) => ({ key: k, label: labelMap?.[k]?.label ?? labelMap?.[k] ?? k, count }));
    const max = Math.max(1, ...entries.map((e) => e.count));
    return entries.map((e) => ({ ...e, pct: (e.count / max) * 100 }));
  }

  let formatBars  = $derived(buildBars(stats.byFormat,    FORMATS));
  let conditionBars = $derived(buildBars(stats.byCondition, CONDITIONS, CONDITION_ORDER));
  let decadeBars  = $derived(buildBars(stats.byDecade,    null));

  // Activity sparkline normalization
  let activityMax = $derived(Math.max(1, ...stats.activity.map((a) => a.count)));
</script>

<svelte:head>
  <title>Stats — Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div class="eyebrow">Your collection</div>
    <h1>In <em>numbers</em>.</h1>
  </header>

  {#if stats.totalCount === 0}
    <div class="empty-state">
      <svg class="empty-svg" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <!-- Three ascending bars -->
        <rect x="12" y="38" width="8" height="14" />
        <rect x="28" y="28" width="8" height="24" />
        <rect x="44" y="18" width="8" height="34" />
        <!-- Axis -->
        <line x1="8" y1="54" x2="56" y2="54" opacity="0.5" />
      </svg>
      <h2>No records yet.</h2>
      <p>Add some records to your collections to see stats here.</p>
    </div>
  {:else}
    <!-- ── Totals row ─────────────────────────────────── -->
    <section class="totals">
      <div class="total">
        <div class="total-label">Records</div>
        <div class="total-value">{stats.totalCount.toLocaleString()}</div>
      </div>
      <div class="total">
        <div class="total-label">Paid</div>
        <div class="total-value">{fmtPrice(stats.totalPaid)}</div>
      </div>
      <div class="total">
        <div class="total-label">Current value</div>
        <div class="total-value accent">{fmtPrice(stats.totalValue)}</div>
      </div>
      <div class="total">
        <div class="total-label">Net</div>
        <div class="total-value" class:positive={net > 0} class:negative={net < 0}>
          {net > 0 ? '+' : ''}{fmtPrice(net)}
          {#if stats.totalPaid > 0}
            <span class="net-pct" class:positive={net > 0} class:negative={net < 0}>
              {netPct > 0 ? '+' : ''}{netPct.toFixed(0)}%
            </span>
          {/if}
        </div>
      </div>
    </section>

    <!-- ── 12-month activity sparkline ─────────────── -->
    <section class="section">
      <h2>Recent activity</h2>
      <p class="lede">Records added per month, last 12 months.</p>
      <div class="activity">
        {#each stats.activity as point}
          <div class="activity-col" title="{point.count} record{point.count === 1 ? '' : 's'} in {point.label}">
            <div
              class="activity-bar"
              style:height="{(point.count / activityMax) * 100}%"
              class:empty={point.count === 0}
            ></div>
            <div class="activity-count">{point.count > 0 ? point.count : ''}</div>
            <div class="activity-label">{point.label}</div>
          </div>
        {/each}
      </div>
    </section>

    <!-- ── Breakdowns: format + condition + decade ──── -->
    <section class="section breakdowns">
      <div class="breakdown">
        <h3>By format</h3>
        <div class="bars">
          {#each formatBars as bar}
            <div class="bar-row">
              <div class="bar-label">{bar.label}</div>
              <div class="bar-track">
                <div class="bar-fill" style:width="{bar.pct}%"></div>
              </div>
              <div class="bar-count">{bar.count}</div>
            </div>
          {/each}
        </div>
      </div>

      <div class="breakdown">
        <h3>By condition</h3>
        <div class="bars">
          {#each conditionBars as bar}
            <div class="bar-row">
              <div class="bar-label">{bar.label}</div>
              <div class="bar-track">
                <div class="bar-fill" style:width="{bar.pct}%"></div>
              </div>
              <div class="bar-count">{bar.count}</div>
            </div>
          {/each}
        </div>
      </div>

      {#if decadeBars.length > 0}
        <div class="breakdown">
          <h3>By decade</h3>
          <div class="bars">
            {#each decadeBars as bar}
              <div class="bar-row">
                <div class="bar-label">{bar.label}</div>
                <div class="bar-track">
                  <div class="bar-fill" style:width="{bar.pct}%"></div>
                </div>
                <div class="bar-count">{bar.count}</div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <!-- ── Top 10 most valuable ──────────────────────── -->
    {#if stats.top10.length > 0}
      <section class="section">
        <h2>Most valuable</h2>
        <p class="lede">Your top {stats.top10.length} {stats.top10.length === 1 ? 'record' : 'records'} by current value.</p>
        <ol class="top-list">
          {#each stats.top10 as r, idx}
            <li>
              <span class="top-rank">{idx + 1}</span>
              <a href="/app/c/{r.collection_id}" class="top-link">
                <span class="top-artist">{r.artist}</span>
                <span class="top-sep">·</span>
                <span class="top-title">{r.title}</span>
              </a>
              <span class="top-value">{fmtPriceDecimal(r.value)}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    <!-- ── Top tags ──────────────────────────────────── -->
    {#if stats.topTags.length > 0}
      <section class="section">
        <h2>Top tags</h2>
        <div class="tag-cloud">
          {#each stats.topTags as { tag, count }}
            <span class="tag-chip">
              <span class="tag-chip-name">{tag}</span>
              <span class="tag-chip-count">{count}</span>
            </span>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .page { padding: 40px 40px 80px; max-width: 980px; margin: 0 auto; }

  .page-header { margin-bottom: 36px; }

  .eyebrow {
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.3em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 14px;
  }

  h1 {
    font-family: var(--ff-display); font-size: clamp(40px, 5.5vw, 64px);
    font-weight: 400; line-height: 0.95;
  }
  h1 em { font-style: italic; color: var(--accent); font-weight: 500; }

  .empty-state {
    text-align: center;
    padding: 80px 32px;
    max-width: 500px;
    margin: 60px auto;
  }
  .empty-svg {
    width: 56px; height: 56px;
    margin: 0 auto 24px;
    color: var(--ink-3);
    display: block;
  }
  .empty-state h2 {
    font-family: var(--ff-display); font-size: 30px;
    font-weight: 400; margin-bottom: 14px;
  }
  .empty-state p {
    font-family: var(--ff-display); font-style: italic;
    font-size: 16px; color: var(--ink-2);
  }

  /* ── Totals row ───────────────────────────────────── */
  .totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 18px;
    padding: 26px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    margin-bottom: 40px;
  }
  .total { text-align: left; }
  .total-label {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--ink-3); margin-bottom: 6px;
  }
  .total-value {
    font-family: var(--ff-display); font-size: 32px;
    font-weight: 500; color: var(--ink);
    line-height: 1;
    display: flex; align-items: baseline; gap: 10px;
  }
  .total-value.accent { color: var(--accent); }
  .total-value.positive { color: var(--success); }
  .total-value.negative { color: var(--danger); }
  .net-pct {
    font-size: 14px;
    font-family: var(--ff-mono);
    letter-spacing: 0.05em;
    color: var(--ink-3);
  }
  .net-pct.positive { color: var(--success); }
  .net-pct.negative { color: var(--danger); }

  /* ── Section ──────────────────────────────────────── */
  .section { margin-bottom: 50px; }
  h2 {
    font-family: var(--ff-display); font-size: 26px;
    font-weight: 500; margin-bottom: 8px; color: var(--ink);
  }
  .lede {
    font-family: var(--ff-display); font-style: italic;
    font-size: 14px; color: var(--ink-2);
    margin-bottom: 22px;
  }

  /* ── Activity sparkline ───────────────────────────── */
  .activity {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 20px 18px 14px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    height: 200px;
  }
  .activity-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    gap: 4px;
  }
  .activity-bar {
    width: 100%;
    background: var(--accent);
    border-radius: var(--radius) var(--radius) 0 0;
    min-height: 2px;
    margin-top: auto;
    transition: opacity var(--t);
  }
  .activity-bar.empty {
    background: var(--bg-3);
  }
  .activity-col:hover .activity-bar:not(.empty) {
    opacity: 0.75;
  }
  .activity-count {
    font-family: var(--ff-mono);
    font-size: 9px;
    color: var(--ink-3);
    min-height: 12px;
  }
  .activity-label {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  /* ── Breakdowns ───────────────────────────────────── */
  .breakdowns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 32px;
  }
  .breakdown {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    padding: 22px;
  }
  .breakdown h3 {
    font-family: var(--ff-display);
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 14px;
    color: var(--ink);
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 100px 1fr 32px;
    align-items: center;
    gap: 10px;
  }
  .bar-label {
    font-family: var(--ff-display);
    font-size: 13px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track {
    height: 8px;
    background: var(--bg-3);
    border-radius: 99px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
    transition: width 0.3s ease;
  }
  .bar-count {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-3);
    text-align: right;
  }

  /* ── Top list ─────────────────────────────────────── */
  .top-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .top-list li {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--groove);
  }
  .top-list li:last-child { border-bottom: none; }
  .top-rank {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    width: 22px;
    flex-shrink: 0;
  }
  .top-link {
    flex: 1;
    display: flex;
    gap: 8px;
    align-items: baseline;
    color: inherit;
    overflow: hidden;
  }
  .top-link:hover { color: var(--accent); }
  .top-artist {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    flex-shrink: 0;
    max-width: 30%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top-link:hover .top-artist { color: inherit; }
  .top-sep { color: var(--ink-3); opacity: 0.4; }
  .top-title {
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .top-value {
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--accent);
    font-weight: 500;
    flex-shrink: 0;
  }

  /* ── Tag cloud ────────────────────────────────────── */
  .tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tag-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 14px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: 99px;
  }
  .tag-chip-name {
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
  }
  .tag-chip-count {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
  }

  @media (max-width: 640px) {
    .page { padding: 24px 18px 60px; }
    .totals { padding: 18px; gap: 14px; }
    .total-value { font-size: 24px; }
    .bar-row { grid-template-columns: 80px 1fr 28px; gap: 8px; }
    .bar-label { font-size: 12px; }
    .top-list li { padding: 10px 14px; gap: 8px; }
    .top-artist { display: none; }  /* save room on tiny screens */
    .activity { gap: 4px; padding: 14px 8px 10px; height: 160px; }
    .activity-label { font-size: 8px; }
  }
</style>
