<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { FORMATS, shortCondition } from '$lib/formats';

  let { data } = $props();
  const collection = $derived(data.collection);
  const records    = $derived(data.records ?? []);

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<svelte:head>
  <title>Archive — {collection.name} — Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <a class="back-link" href="/app/c/{collection.id}">← Back to {collection.name}</a>
    <div class="header-main">
      <div class="eyebrow">
        <span>{collection.icon}</span>
        <span>{collection.name}</span>
        <span class="dot">·</span>
        <span>Archive</span>
      </div>
      <h1>
        {#if records.length === 0}
          A quiet <em>shelf</em>.
        {:else}
          {records.length} <em>archived</em>.
        {/if}
      </h1>
      <p class="lede">
        Records you no longer own, kept for memory. You can bring them back, or delete them forever.
      </p>
    </div>
  </header>

  {#if records.length === 0}
    <div class="empty-state">
      <p>Nothing in the archive. When you part with a record, you can keep its memory here.</p>
    </div>
  {:else}
    <div class="archive-list">
      {#each records as record (record.id)}
        <article class="archive-card">
          <div class="cover">
            {#if record.image_url}
              <img src={record.image_url} alt="{record.artist} – {record.title}" loading="lazy" />
            {:else}
              <div class="cover-placeholder">{FORMATS[record.format]?.icon ?? '—'}</div>
            {/if}
          </div>

          <div class="info">
            <div class="info-artist">{record.artist}</div>
            <div class="info-title">{record.title}</div>
            <div class="info-meta">
              {[record.label, record.year, FORMATS[record.format]?.label, shortCondition(record.condition)]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {#if record.archived_at}
              <div class="info-archived-at">Archived {fmtDate(record.archived_at)}</div>
            {/if}
          </div>

          <div class="actions">
            <form
              method="POST"
              action="?/unarchive"
              use:enhance={() => {
                return async ({ result }) => {
                  if (result.type === 'success') await invalidateAll();
                };
              }}
            >
              <input type="hidden" name="id" value={record.id} />
              <button type="submit" class="btn ghost">↩ Bring back</button>
            </form>

            <form
              method="POST"
              action="?/permanentDelete"
              use:enhance={({ cancel }) => {
                if (!confirm(`Permanently delete "${record.artist} – ${record.title}"?\n\nThis cannot be undone.`)) {
                  cancel();
                  return;
                }
                return async ({ result }) => {
                  if (result.type === 'success') await invalidateAll();
                };
              }}
            >
              <input type="hidden" name="id" value={record.id} />
              <button type="submit" class="btn ghost danger">Delete forever</button>
            </form>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    padding: 40px 40px 80px;
    max-width: 900px;
    margin: 0 auto;
  }

  .back-link {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 20px;
    display: inline-block;
    transition: color var(--t);
  }
  .back-link:hover { color: var(--accent); }

  .page-header { margin-bottom: 40px; }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 14px;
  }

  .eyebrow .dot { opacity: 0.5; }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(36px, 5vw, 56px);
    font-weight: 400;
    line-height: 0.95;
    margin-bottom: 14px;
  }
  h1 em { font-style: italic; color: var(--accent); font-weight: 500; }

  .lede {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-2);
    line-height: 1.55;
    max-width: 56ch;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--ink-3);
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
  }

  /* ── Archive list ─────────────────────────────────── */
  .archive-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .archive-card {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    transition: border-color var(--t);
    opacity: 0.85;
  }

  .archive-card:hover {
    opacity: 1;
    border-color: var(--ink-3);
  }

  .cover {
    width: 72px;
    height: 72px;
    flex-shrink: 0;
    background: var(--bg-3);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .cover img { width: 100%; height: 100%; object-fit: cover; }

  .cover-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
    opacity: 0.4;
  }

  .info { flex: 1; min-width: 0; }

  .info-artist {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 4px;
  }

  .info-title {
    font-family: var(--ff-display);
    font-size: 18px;
    color: var(--ink);
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .info-meta {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .info-archived-at {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 11px;
    color: var(--ink-3);
    margin-top: 4px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn {
    padding: 7px 14px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background var(--t), color var(--t), border-color var(--t);
    border: 1px solid var(--groove);
    background: transparent;
    color: var(--ink-2);
    white-space: nowrap;
  }

  .btn:hover { color: var(--ink); border-color: var(--ink-3); background: var(--bg-3); }

  .btn.danger:hover { color: var(--danger); border-color: var(--danger); }

  @media (max-width: 640px) {
    .page { padding: 24px 18px 60px; }
    .archive-card { flex-wrap: wrap; }
    .cover { width: 56px; height: 56px; }
    .actions { flex-direction: row; width: 100%; margin-top: 8px; }
    .actions form { flex: 1; }
    .btn { width: 100%; }
  }
</style>
