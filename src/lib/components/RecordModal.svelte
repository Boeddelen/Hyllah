<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { FORMATS, CONDITIONS } from '$lib/formats';

  /**
   * Props:
   *  - open: boolean — controls visibility
   *  - record: object | null — existing record to edit, or null for create
   *  - onclose: () => void — called when user dismisses
   */
  let { open = $bindable(false), record = null, onclose } = $props();

  // Form field state — initialized from record (edit) or defaults (create)
  let artist = $state('');
  let title = $state('');
  let label = $state('');
  let year = $state('');
  let format = $state('vinyl');
  let genre = $state('');
  let condition = $state('VG_PLUS');
  let notes = $state('');
  let tagsText = $state('');
  let purchasePrice = $state('');
  let valueOverride = $state('');

  let submitting = $state(false);
  let errorMsg = $state('');

  // Duplicate detection state
  let duplicates = $state([]);
  let showDuplicateWarning = $state(false);
  let forceCreate = $state('');  // becomes "true" when user opts to add anyway

  // Reset/populate fields whenever the modal opens or record changes
  $effect(() => {
    if (open) {
      if (record) {
        artist = record.artist ?? '';
        title = record.title ?? '';
        label = record.label ?? '';
        year = record.year ?? '';
        format = record.format ?? 'vinyl';
        genre = record.genre ?? '';
        condition = record.condition ?? 'VG_PLUS';
        notes = record.notes ?? '';
        tagsText = (record.tags ?? []).join(', ');
        purchasePrice = record.purchase_price?.toString() ?? '';
        valueOverride = record.value_override?.toString() ?? '';
      } else {
        artist = '';
        title = '';
        label = '';
        year = '';
        format = 'vinyl';
        genre = '';
        condition = 'VG_PLUS';
        notes = '';
        tagsText = '';
        purchasePrice = '';
        valueOverride = '';
      }
      errorMsg = '';
      submitting = false;
      duplicates = [];
      showDuplicateWarning = false;
      forceCreate = '';
    }
  });

  function close() {
    if (submitting) return;
    open = false;
    onclose?.();
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && open) close();
  }

  let isEdit = $derived(record !== null);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="backdrop"
    onclick={handleBackdropClick}
    role="presentation"
  >
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header">
        <div>
          <div class="modal-eyebrow">{isEdit ? 'Edit record' : 'Add a record'}</div>
          <h2 id="modal-title">
            {#if isEdit}
              {record.artist} <em>—</em> {record.title}
            {:else}
              What's on the <em>shelf?</em>
            {/if}
          </h2>
        </div>
        <button class="close-btn" onclick={close} aria-label="Close" disabled={submitting}>✕</button>
      </header>

      <form
        method="POST"
        action="?/{isEdit ? 'update' : 'create'}"
        use:enhance={() => {
          submitting = true;
          errorMsg = '';
          return async ({ result, update }) => {
            if (result.type === 'success' || result.type === 'redirect') {
              await update({ reset: false });
              await invalidateAll();
              submitting = false;
              open = false;
              onclose?.();
            } else if (result.type === 'failure') {
              // 409 = duplicate detection — show duplicates and offer to add anyway
              if (result.status === 409 && result.data?.duplicates?.length) {
                duplicates = result.data.duplicates;
                showDuplicateWarning = true;
                submitting = false;
              } else {
                errorMsg = result.data?.error ?? 'Could not save record';
                submitting = false;
              }
            } else {
              await update();
              submitting = false;
            }
          };
        }}
      >
        {#if isEdit}
          <input type="hidden" name="id" value={record.id} />
        {/if}
        <!-- Hidden flag: set to "true" to bypass duplicate warning -->
        <input type="hidden" name="force" bind:value={forceCreate} />

        <div class="form-grid">
          <!-- Row 1: Artist + Title -->
          <div class="field span-2">
            <label for="artist">Artist <span class="req">*</span></label>
            <input
              id="artist"
              name="artist"
              type="text"
              bind:value={artist}
              maxlength="200"
              required
              placeholder="e.g. Nirvana"
            />
          </div>

          <div class="field span-2">
            <label for="title">Title <span class="req">*</span></label>
            <input
              id="title"
              name="title"
              type="text"
              bind:value={title}
              maxlength="300"
              required
              placeholder="e.g. Nevermind"
            />
          </div>

          <!-- Row 2: Label + Year + Genre -->
          <div class="field">
            <label for="label">Label</label>
            <input
              id="label"
              name="label"
              type="text"
              bind:value={label}
              maxlength="200"
              placeholder="DGC"
            />
          </div>

          <div class="field">
            <label for="year">Year</label>
            <input
              id="year"
              name="year"
              type="text"
              bind:value={year}
              maxlength="12"
              placeholder="1991"
            />
          </div>

          <div class="field span-2">
            <label for="genre">Genre</label>
            <input
              id="genre"
              name="genre"
              type="text"
              bind:value={genre}
              maxlength="100"
              placeholder="Rock"
            />
          </div>

          <!-- Row 3: Format + Condition -->
          <div class="field span-2">
            <label for="format">Format</label>
            <select id="format" name="format" bind:value={format}>
              {#each Object.entries(FORMATS) as [code, info]}
                <option value={code}>{info.icon} {info.label}</option>
              {/each}
            </select>
          </div>

          <div class="field span-2">
            <label for="condition">Condition</label>
            <select id="condition" name="condition" bind:value={condition}>
              {#each Object.entries(CONDITIONS) as [code, label]}
                <option value={code}>{label}</option>
              {/each}
            </select>
          </div>

          <!-- Row 4: Prices -->
          <div class="field span-2">
            <label for="purchase_price">What you paid</label>
            <div class="price-input">
              <span class="currency">€</span>
              <input
                id="purchase_price"
                name="purchase_price"
                type="text"
                inputmode="decimal"
                bind:value={purchasePrice}
                placeholder="0.00"
              />
            </div>
          </div>

          <div class="field span-2">
            <label for="value_override">Current value (override)</label>
            <div class="price-input">
              <span class="currency">€</span>
              <input
                id="value_override"
                name="value_override"
                type="text"
                inputmode="decimal"
                bind:value={valueOverride}
                placeholder="optional"
              />
            </div>
            <div class="field-hint">Discogs prices come later. Manual value for now.</div>
          </div>

          <!-- Row 5: Tags -->
          <div class="field span-4">
            <label for="tags">Tags</label>
            <input
              id="tags"
              name="tags"
              type="text"
              bind:value={tagsText}
              placeholder="grunge, 90s, favorites"
            />
            <div class="field-hint">Separate with commas. Up to 30 tags.</div>
          </div>

          <!-- Row 6: Notes -->
          <div class="field span-4">
            <label for="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              bind:value={notes}
              rows="3"
              placeholder="Where you found it, who gave it to you, anything worth remembering."
            ></textarea>
          </div>
        </div>

        {#if errorMsg}
          <div class="error">{errorMsg}</div>
        {/if}

        {#if showDuplicateWarning}
          <div class="duplicate-warning">
            <div class="dup-header">
              <strong>Looks like you may already have this.</strong>
              <span class="dup-subtitle">Found {duplicates.length} similar record{duplicates.length === 1 ? '' : 's'} in your collection:</span>
            </div>
            <ul class="dup-list">
              {#each duplicates as d}
                <li>
                  <span class="dup-artist">{d.artist}</span>
                  <span class="dup-sep">·</span>
                  <span class="dup-title">{d.title}</span>
                  {#if d.year}<span class="dup-sep">·</span><span class="dup-year">{d.year}</span>{/if}
                  {#if d.is_archived}<span class="dup-badge">archived</span>{/if}
                </li>
              {/each}
            </ul>
            <div class="dup-actions">
              <button
                type="button"
                class="btn ghost"
                onclick={() => { showDuplicateWarning = false; }}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="btn primary"
                onclick={() => { forceCreate = 'true'; }}
              >
                Add anyway
              </button>
            </div>
          </div>
        {/if}

        <footer class="modal-footer" class:hidden={showDuplicateWarning}>
          <button type="button" class="btn ghost" onclick={close} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" class="btn primary" disabled={submitting || !artist.trim() || !title.trim()}>
            {submitting ? (isEdit ? 'Saving...' : 'Adding...') : isEdit ? 'Save changes' : 'Add to collection'}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 40px 20px;
    overflow-y: auto;
    animation: fadeIn 0.18s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 720px;
    box-shadow: 0 30px 80px var(--shadow);
    animation: slideUp 0.22s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 28px 30px 22px;
    border-bottom: 1px solid var(--groove);
  }

  .modal-eyebrow {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }

  h2 {
    font-family: var(--ff-display);
    font-size: 30px;
    font-weight: 400;
    line-height: 1.05;
    color: var(--ink);
  }

  h2 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .close-btn {
    background: none;
    border: 1px solid var(--groove);
    border-radius: 50%;
    width: 36px;
    height: 36px;
    color: var(--ink-2);
    font-size: 14px;
    flex-shrink: 0;
    transition:
      background var(--t),
      color var(--t),
      border-color var(--t);
  }

  .close-btn:hover:not(:disabled) {
    background: var(--bg-3);
    color: var(--ink);
    border-color: var(--ink-3);
  }

  form {
    padding: 24px 30px 26px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    grid-column: span 4;
  }

  .field.span-2 {
    grid-column: span 2;
  }

  .field.span-4 {
    grid-column: span 4;
  }

  label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .req {
    color: var(--accent);
    margin-left: 2px;
  }

  input[type='text'],
  select,
  textarea {
    width: 100%;
    padding: 11px 14px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
    transition: border-color var(--t);
  }

  textarea {
    resize: vertical;
    font-family: var(--ff-body);
    font-size: 15px;
    line-height: 1.5;
    min-height: 70px;
  }

  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--accent);
    outline: none;
  }

  select {
    appearance: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 5l3 3 3-3' stroke='%23c2a988' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
  }

  .price-input {
    position: relative;
  }

  .currency {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    font-family: var(--ff-display);
    font-size: 16px;
    pointer-events: none;
  }

  .price-input input {
    padding-left: 28px;
  }

  .field-hint {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-3);
    margin-top: 2px;
  }

  .error {
    margin-top: 18px;
    padding: 11px 14px;
    background: rgba(198, 74, 74, 0.12);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius);
    font-size: 13px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 26px;
    padding-top: 22px;
    border-top: 1px solid var(--groove);
  }

  .modal-footer.hidden { display: none; }

  /* ── Duplicate warning ──────────────────────────────── */
  .duplicate-warning {
    margin-top: 22px;
    padding: 18px 20px;
    background: rgba(212, 163, 86, 0.08);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
  }

  .dup-header { margin-bottom: 12px; }
  .dup-header strong {
    font-family: var(--ff-display);
    font-size: 16px;
    font-weight: 500;
    color: var(--accent);
    display: block;
    margin-bottom: 4px;
  }
  .dup-subtitle {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-2);
  }

  .dup-list {
    list-style: none;
    padding: 0;
    margin: 0 0 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dup-list li {
    padding: 8px 12px;
    background: var(--bg-3);
    border-radius: var(--radius);
    font-size: 13px;
    font-family: var(--ff-display);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .dup-artist {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .dup-title { color: var(--ink); }
  .dup-year { color: var(--ink-3); font-size: 12px; }
  .dup-sep { color: var(--ink-3); opacity: 0.5; }

  .dup-badge {
    margin-left: auto;
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-3);
    border: 1px solid var(--groove);
    border-radius: 99px;
    padding: 2px 8px;
  }

  .dup-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn {
    padding: 12px 24px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 1px solid transparent;
    transition: background var(--t), color var(--t), transform var(--t);
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
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn.ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--groove);
  }

  .btn.ghost:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--ink-3);
  }

  @media (max-width: 640px) {
    .backdrop { padding: 0; align-items: stretch; }
    .modal { border-radius: 0; max-width: 100%; min-height: 100vh; }
    .modal-header { padding: 22px 22px 18px; }
    form { padding: 20px 22px 24px; }
    h2 { font-size: 24px; }
    .form-grid { gap: 14px; }
    .field.span-2 { grid-column: span 4; }
  }
</style>
