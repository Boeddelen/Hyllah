<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { COLLECTION_ICONS } from '$lib/formats';

  let { data, form } = $props();

  let showCreate = $state(false);
  let editingId = $state(null);

  // Form state
  let createName = $state('');
  let createIcon = $state('💿');
  let createDesc = $state('');

  let editName = $state('');
  let editIcon = $state('💿');
  let editDesc = $state('');

  function startEdit(c) {
    editingId = c.id;
    editName = c.name;
    editIcon = c.icon ?? '💿';
    editDesc = c.description ?? '';
  }

  function cancelEdit() {
    editingId = null;
  }
</script>

<svelte:head>
  <title>Manage collections — Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div class="eyebrow">Collections</div>
    <h1>Your <em>shelves</em>.</h1>
    <p class="lede">
      Each collection holds records. Use separate collections for separate purposes — your main
      collection, things for sale, a wishlist, gifts from family. You can move records between
      them later.
    </p>
  </header>

  <div class="actions-row">
    {#if !showCreate}
      <button class="btn primary" onclick={() => (showCreate = true)}>＋ New collection</button>
    {/if}
  </div>

  {#if showCreate}
    <div class="card create-card">
      <h2>New collection</h2>
      <form
        method="POST"
        action="?/create"
        use:enhance={() => {
          return async ({ update }) => {
            await update();
            await invalidateAll();
            showCreate = false;
            createName = '';
            createDesc = '';
            createIcon = '💿';
          };
        }}
      >
        <div class="field">
          <label for="create-name">Name</label>
          <input
            id="create-name"
            name="name"
            type="text"
            bind:value={createName}
            maxlength="60"
            required
            placeholder="e.g. Main collection"
            autofocus
          />
        </div>

        <div class="field">
          <label>Icon</label>
          <div class="icon-grid">
            {#each COLLECTION_ICONS as opt}
              <button
                type="button"
                class="icon-btn"
                class:active={createIcon === opt}
                onclick={() => (createIcon = opt)}
                aria-label="Use {opt}"
              >
                {opt}
              </button>
            {/each}
          </div>
          <input type="hidden" name="icon" value={createIcon} />
        </div>

        <div class="field">
          <label for="create-desc">Description (optional)</label>
          <input
            id="create-desc"
            name="description"
            type="text"
            bind:value={createDesc}
            maxlength="200"
            placeholder="e.g. Records I actually own and play"
          />
        </div>

        {#if form?.action === 'create' && form?.error}
          <div class="error">{form.error}</div>
        {/if}

        <div class="form-actions">
          <button type="button" class="btn ghost" onclick={() => (showCreate = false)}>
            Cancel
          </button>
          <button type="submit" class="btn primary" disabled={!createName.trim()}>
            Create
          </button>
        </div>
      </form>
    </div>
  {/if}

  <div class="collections-list">
    {#each data.collections as collection (collection.id)}
      {@const counts = data.counts[collection.id] ?? { active: 0, archived: 0 }}

      {#if editingId === collection.id}
        <div class="card editing-card">
          <h2>Edit collection</h2>
          <form
            method="POST"
            action="?/update"
            use:enhance={() => {
              return async ({ update }) => {
                await update();
                await invalidateAll();
                editingId = null;
              };
            }}
          >
            <input type="hidden" name="id" value={collection.id} />
            <div class="field">
              <label for="edit-name-{collection.id}">Name</label>
              <input
                id="edit-name-{collection.id}"
                name="name"
                type="text"
                bind:value={editName}
                maxlength="60"
                required
              />
            </div>
            <div class="field">
              <label>Icon</label>
              <div class="icon-grid">
                {#each COLLECTION_ICONS as opt}
                  <button
                    type="button"
                    class="icon-btn"
                    class:active={editIcon === opt}
                    onclick={() => (editIcon = opt)}
                    aria-label="Use {opt}"
                  >
                    {opt}
                  </button>
                {/each}
              </div>
              <input type="hidden" name="icon" value={editIcon} />
            </div>
            <div class="field">
              <label for="edit-desc-{collection.id}">Description</label>
              <input
                id="edit-desc-{collection.id}"
                name="description"
                type="text"
                bind:value={editDesc}
                maxlength="200"
              />
            </div>

            {#if form?.action === 'update' && form?.error}
              <div class="error">{form.error}</div>
            {/if}

            <div class="form-actions">
              <button type="button" class="btn ghost" onclick={cancelEdit}>Cancel</button>
              <button type="submit" class="btn primary">Save changes</button>
            </div>
          </form>
        </div>
      {:else}
        <div class="collection-row">
          <a href="/app/c/{collection.id}" class="row-main">
            <span class="row-icon">{collection.icon ?? '💿'}</span>
            <div class="row-text">
              <div class="row-name">{collection.name}</div>
              <div class="row-meta">
                {counts.active}
                {counts.active === 1 ? 'record' : 'records'}
                {#if counts.archived > 0}
                  · <span class="archived-count">{counts.archived} archived</span>
                {/if}
                {#if collection.description}
                  · {collection.description}
                {/if}
              </div>
            </div>
          </a>
          <div class="row-actions">
            <button class="link-btn" onclick={() => startEdit(collection)}>Edit</button>
            {#if data.collections.length > 1}
              <form
                method="POST"
                action="?/delete"
                use:enhance={({ cancel }) => {
                  const total = counts.active + counts.archived;
                  const msg =
                    total === 0
                      ? `Delete "${collection.name}"?`
                      : `Delete "${collection.name}" and all ${total} record${total === 1 ? '' : 's'} inside? This cannot be undone.`;
                  if (!confirm(msg)) {
                    cancel();
                    return;
                  }
                  return async ({ update }) => {
                    await update();
                    await invalidateAll();
                  };
                }}
                style="display:inline"
              >
                <input type="hidden" name="id" value={collection.id} />
                <button type="submit" class="link-btn danger">Delete</button>
              </form>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .page {
    padding: 40px 40px 80px;
    max-width: 800px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 40px;
  }

  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 14px;
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(40px, 5.5vw, 60px);
    font-weight: 400;
    line-height: 0.95;
    margin-bottom: 18px;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .lede {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 17px;
    color: var(--ink-2);
    line-height: 1.55;
    max-width: 60ch;
  }

  .actions-row {
    margin-bottom: 24px;
  }

  .btn {
    padding: 11px 22px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
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
  }

  .btn.primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn.ghost {
    background: transparent;
    color: var(--ink-2);
    border: 1px solid var(--groove);
  }

  .btn.ghost:hover {
    color: var(--ink);
    border-color: var(--ink-3);
  }

  .card {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    padding: 28px;
    margin-bottom: 20px;
  }

  .card h2 {
    font-family: var(--ff-display);
    font-size: 24px;
    font-weight: 500;
    margin-bottom: 24px;
  }

  .field {
    margin-bottom: 22px;
  }

  label {
    display: block;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 8px;
  }

  input[type='text'] {
    width: 100%;
    padding: 12px 14px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
  }

  input[type='text']:focus {
    border-color: var(--accent);
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 5px;
  }

  .icon-btn {
    aspect-ratio: 1;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-size: 20px;
    transition:
      background var(--t),
      border-color var(--t);
  }

  .icon-btn:hover {
    background: var(--surface);
    border-color: var(--ink-3);
  }

  .icon-btn.active {
    background: var(--accent-glow);
    border-color: var(--accent);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 24px;
  }

  .error {
    background: rgba(198, 74, 74, 0.1);
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 10px 14px;
    border-radius: var(--radius);
    margin-bottom: 14px;
    font-size: 13px;
  }

  /* ── List rows ─────────────────────────────────────── */
  .collections-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .collection-row {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    transition: border-color var(--t);
  }

  .collection-row:hover {
    border-color: var(--ink-3);
  }

  .row-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 22px;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }

  .row-icon {
    font-size: 26px;
    flex-shrink: 0;
  }

  .row-text {
    flex: 1;
    min-width: 0;
  }

  .row-name {
    font-family: var(--ff-display);
    font-size: 20px;
    font-weight: 500;
    color: var(--ink);
    margin-bottom: 3px;
  }

  .row-meta {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-3);
    letter-spacing: 0.04em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .archived-count {
    color: var(--ink-3);
  }

  .row-actions {
    display: flex;
    gap: 4px;
    padding-right: 18px;
    flex-shrink: 0;
  }

  .link-btn {
    background: none;
    border: none;
    padding: 8px 12px;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-3);
    cursor: pointer;
    border-radius: var(--radius);
    transition: color var(--t);
  }

  .link-btn:hover {
    color: var(--accent);
  }

  .link-btn.danger:hover {
    color: var(--danger);
  }

  @media (max-width: 600px) {
    .page {
      padding: 24px 22px 60px;
    }
    .collection-row {
      flex-direction: column;
      align-items: stretch;
    }
    .row-actions {
      padding: 0 18px 14px;
      justify-content: flex-end;
    }
  }
</style>
