<script>
  import { enhance } from '$app/forms';
  import { tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { FORMATS, CONDITIONS } from '$lib/formats';
  import MusicBrainzSearch from './MusicBrainzSearch.svelte';
  import CoverUpload from './CoverUpload.svelte';

  /**
   * Props:
   *  - open: boolean (bindable)
   *  - record: existing record (edit) or null (create)
   *  - onclose: callback when modal dismissed
   */
  /**
   * Props:
   *  - open: boolean (bindable)
   *  - record: existing record (edit) or null (create)
   *  - onclose: callback when modal dismissed
   *  - allCollections: { id, name }[]  — all the user's collections, for membership UI
   *  - currentCollectionId: the collection we're viewing on this page (always included)
   */
  let {
    open = $bindable(false),
    record = null,
    onclose,
    allCollections = [],
    currentCollectionId = null
  } = $props();

  // The browser Supabase client — provided via root layout
  let supabase = $derived(page.data.supabase);

  // ── Form fields ─────────────────────────────────────
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

  // ── Discogs fields ──────────────────────────────────
  let discogsId = $state('');
  let mbid = $state('');               // MusicBrainz release id (from autofill)
  let imageUrl = $state('');
  let prices = $state(null);            // object | null
  let priceWarning = $state('');        // 'seller_settings' | 'unavailable' | ''

  // ── Tracklist ───────────────────────────────────────
  let tracks = $state([]);              // [{position, title, duration}]
  let tracksDirty = $state(false);      // becomes true on edit, signals server to overwrite
  let tracksLoading = $state(false);

  // ── Collection memberships ──────────────────────────
  // Set of collection IDs this record is in. The current page's collection
  // is always considered locked-in (we can't toggle it off here — the user
  // must use the card-level "Remove from this collection" action instead).
  let memberCollectionIds = $state(new Set());
  let membershipsLoading = $state(false);
  let membershipsDirty = $state(false);  // becomes true when user touches the multiselect

  // ── UI state ────────────────────────────────────────
  let submitting = $state(false);
  let errorMsg = $state('');
  let showSearch = $state(false);       // Discogs search panel shown?
  let autofilling = $state(false);
  // In-flight background cover fetch (Promise|null). Saves wait briefly on it.
  let pendingCover = null;
  let refreshingPrices = $state(false);
  let showUpload = $state(false);    // Cover-upload component visible?

  // Duplicate detection
  let duplicates = $state([]);
  let showDuplicateWarning = $state(false);
  let forceCreate = $state('');

  let isEdit = $derived(record !== null);
  let isLinked = $derived(Boolean(discogsId));

  // ── Tag autocomplete ────────────────────────────────
  let allTags = $state([]);             // [{tag, count}] — fetched once per modal open
  let tagSuggestions = $state([]);

  async function loadTagsCatalog() {
    try {
      const res = await fetch('/api/tags');
      if (res.ok) {
        const data = await res.json();
        allTags = data.tags ?? [];
      }
    } catch {
      // Non-fatal — autocomplete simply won't show
    }
  }

  /** Extract the current fragment being typed (after last comma). */
  function currentFragment(input) {
    const idx = input.lastIndexOf(',');
    return idx === -1 ? input.trim() : input.slice(idx + 1).trim();
  }

  /** Tags already in the input — to exclude from suggestions. */
  function alreadyEntered(input) {
    return input.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  }

  function onTagInput() {
    const frag = currentFragment(tagsText).toLowerCase();
    if (frag.length === 0) {
      tagSuggestions = [];
      return;
    }
    const excluded = new Set(alreadyEntered(tagsText));
    tagSuggestions = allTags
      .filter(({ tag }) => tag.toLowerCase().includes(frag) && !excluded.has(tag.toLowerCase()))
      .slice(0, 6);
  }

  /** Replace the current fragment with the chosen suggestion. */
  function applyTagSuggestion(tag) {
    const idx = tagsText.lastIndexOf(',');
    const prefix = idx === -1 ? '' : tagsText.slice(0, idx + 1) + ' ';
    tagsText = prefix + tag + ', ';
    tagSuggestions = [];
    // refocus the input so user keeps typing
    document.getElementById('tags')?.focus();
  }

  // ── Reset / hydrate when modal opens ────────────────
  $effect(() => {
    if (!open) return;

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
      discogsId = record.discogs_id ?? '';
      mbid = record.mbid ?? '';
      imageUrl = record.image_url ?? '';
      prices = record.prices && Object.keys(record.prices).length > 0 ? record.prices : null;
      // Lazy-fetch tracks for edit mode
      loadTracksFor(record.id);
      // And the record's current collection memberships
      loadMembershipsFor(record.id);
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
      discogsId = '';
      mbid = '';
      imageUrl = '';
      prices = null;
      tracks = [];
      // New record: starts in the current collection only
      memberCollectionIds = new Set(currentCollectionId ? [currentCollectionId] : []);
    }
    priceWarning = '';
    submitting = false;
    errorMsg = '';
    showSearch = false;
    autofilling = false;
    duplicates = [];
    showDuplicateWarning = false;
    forceCreate = '';
    tracksDirty = false;
    tagSuggestions = [];
    showUpload = false;
    membershipsDirty = false;
    // Load (or refresh) the tag catalog for autocomplete
    loadTagsCatalog();
  });

  async function loadTracksFor(recordId) {
    if (!recordId) {
      tracks = [];
      return;
    }
    tracksLoading = true;
    try {
      const res = await fetch(`/api/records/${recordId}/tracks`);
      if (res.ok) {
        const data = await res.json();
        tracks = data.tracks ?? [];
      } else {
        tracks = [];
      }
    } catch (err) {
      console.error('loadTracks failed', err);
      tracks = [];
    } finally {
      tracksLoading = false;
    }
  }

  async function loadMembershipsFor(recordId) {
    if (!recordId) {
      memberCollectionIds = new Set(currentCollectionId ? [currentCollectionId] : []);
      return;
    }
    membershipsLoading = true;
    try {
      const res = await fetch(`/api/records/${recordId}/collections`);
      if (res.ok) {
        const data = await res.json();
        const ids = Array.isArray(data.collectionIds) ? data.collectionIds : [];
        // Ensure the current page's collection is always present
        if (currentCollectionId) ids.push(currentCollectionId);
        memberCollectionIds = new Set(ids);
      } else {
        memberCollectionIds = new Set(currentCollectionId ? [currentCollectionId] : []);
      }
    } catch (err) {
      console.error('loadMemberships failed', err);
      memberCollectionIds = new Set(currentCollectionId ? [currentCollectionId] : []);
    } finally {
      membershipsLoading = false;
    }
  }

  function toggleMembership(collectionId) {
    // The current page's collection is locked-in: you can't remove it from the
    // modal. Use the card's "Remove from this collection" action for that.
    if (collectionId === currentCollectionId) return;
    const next = new Set(memberCollectionIds);
    if (next.has(collectionId)) next.delete(collectionId);
    else next.add(collectionId);
    memberCollectionIds = next;
    membershipsDirty = true;
  }

  // ── MusicBrainz autofill ────────────────────────────
  // Fills metadata + cover + tracklist from MusicBrainz. Prices and the
  // Discogs link are deliberately untouched here — pricing stays a Discogs
  // concern, and autofilling must never clear an existing Discogs link.
  async function handleMusicBrainzSelect(release) {
    showSearch = false;
    autofilling = true;
    errorMsg = '';
    try {
      const res = await fetch(`/api/musicbrainz/autofill?mbid=${encodeURIComponent(release.id)}`);
      if (!res.ok) {
        const txt = await res.text();
        errorMsg = `Autofill failed: ${txt || res.status}`;
        return;
      }
      const data = await res.json();

      // ONLY FILL EMPTY FIELDS (per user choice — preserve what they typed)
      if (!artist.trim() && data.artist) artist = data.artist;
      if (!title.trim() && data.title) title = data.title;
      if (!label.trim() && data.label) label = data.label;
      if (!year.trim() && data.year) year = data.year;
      if (!genre.trim() && data.genre) genre = data.genre;
      // Format: only override if it's still the default 'vinyl' and we got something
      if (format === 'vinyl' && data.format && data.format !== 'vinyl') {
        format = data.format;
      }

      // Remember which MusicBrainz release this came from. Identity data, not
      // user-typed — always reflect the release the user just chose.
      if (data.mbid) mbid = data.mbid;

      // Cover art loads in the background — the Cover Art Archive is slow
      // (~2s) and must never hold up the form. The promise is tracked in
      // pendingCover so a save clicked mid-flight briefly waits for it
      // (see the use:enhance block) instead of saving a coverless record.
      // Snapshot the current image so we don't clobber a cover the user
      // uploads while we wait.
      const imageBefore = imageUrl;
      pendingCover = fetch(`/api/musicbrainz/cover?mbid=${encodeURIComponent(release.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.image_url && imageUrl === imageBefore) imageUrl = d.image_url;
        })
        .catch(() => { /* cover is a nice-to-have — never surface an error for it */ })
        .finally(() => { pendingCover = null; });

      // Tracklist: replace if current is empty OR if current has broken/empty titles
      // (an artifact of the previous bind:value bug — old records may have positions
      // and durations but no titles. Autofilling should fix those.)
      const tracksAreEmpty = tracks.length === 0;
      const tracksAreBroken = tracks.length > 0 && tracks.every((t) => !t.title?.trim());
      if ((tracksAreEmpty || tracksAreBroken) && Array.isArray(data.tracklist)) {
        tracks = data.tracklist.map((t) => ({
          position: t.position ?? '',
          title: t.title,
          duration: t.duration ?? ''
        }));
        tracksDirty = true;
      }
    } catch (err) {
      console.error('autofill error', err);
      errorMsg = 'Autofill request failed';
    } finally {
      autofilling = false;
    }
  }

  function unlinkDiscogs() {
    if (!confirm('Unlink this record from Discogs?\n\nThe metadata stays, but prices and the Discogs cover will be cleared.')) return;
    discogsId = '';
    prices = null;
    priceWarning = '';
    // Only clear image if it's a Discogs CDN image
    if (imageUrl && /img\.discogs\.com|discogs\.com\/images/.test(imageUrl)) {
      imageUrl = '';
    }
  }

  /** A successful upload returns the public URL — replace existing cover. */
  function handleCoverUploaded(url) {
    imageUrl = url;
    showUpload = false;
  }

  function removeCover() {
    if (!confirm('Remove the cover image from this record?')) return;
    imageUrl = '';
    // We don't delete the actual file from storage here — leaves orphaned files.
    // A periodic cleanup job will handle pruning, OR we can delete on Save.
    // For v1, simpler is fine.
  }

  /**
   * Pull fresh prices from Discogs for this record's linked release.
   * Persists directly to the DB so the user doesn't need to Save afterwards.
   */
  async function refreshPrices() {
    if (!record?.id) return;
    refreshingPrices = true;
    errorMsg = '';
    try {
      const res = await fetch(`/api/records/${record.id}/refresh-prices`, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text();
        if (res.status === 412) {
          priceWarning = 'seller_settings';
        } else if (res.status === 429) {
          errorMsg = 'Discogs is rate-limiting us. Try again in a minute.';
        } else {
          errorMsg = `Could not refresh prices: ${txt || res.status}`;
        }
        return;
      }
      const data = await res.json();
      prices = data.prices;
      priceWarning = '';
    } catch (err) {
      console.error('refreshPrices failed', err);
      errorMsg = 'Could not refresh prices.';
    } finally {
      refreshingPrices = false;
    }
  }

  // ── Tracklist editing ───────────────────────────────
  function addTrackRow() {
    tracks = [...tracks, { position: '', title: '', duration: '' }];
    tracksDirty = true;
  }
  function removeTrackRow(idx) {
    tracks = tracks.filter((_, i) => i !== idx);
    tracksDirty = true;
  }
  function moveTrack(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= tracks.length) return;
    const copy = [...tracks];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    tracks = copy;
    tracksDirty = true;
  }
  /** Immutable update of a single field on one track row.
   *  Avoids Svelte 5 reactivity quirks with bind:value on nested properties. */
  function updateTrackField(idx, field, value) {
    if (idx < 0 || idx >= tracks.length) return;
    const copy = [...tracks];
    copy[idx] = { ...copy[idx], [field]: value };
    tracks = copy;
    tracksDirty = true;
  }
  function markTracksDirty() {
    tracksDirty = true;
  }

  // ── Modal lifecycle ─────────────────────────────────
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

  // Serialized tracklist for the form (only included when dirty)
  let tracklistJson = $derived(
    tracksDirty
      ? JSON.stringify(
          tracks
            .filter((t) => t.title?.trim())
            .map((t) => ({
              position: t.position?.trim() || null,
              title: t.title.trim(),
              duration: t.duration?.trim() || null
            }))
        )
      : ''
  );

  // Show only the price matching the current condition (per user choice).
  let matchingPrice = $derived.by(() => {
    if (!prices || !condition) return null;
    const conditionToKey = {
      M: 'Mint (M)',
      NM: 'Near Mint (NM or M-)',
      VG_PLUS: 'Very Good Plus (VG+)',
      VG: 'Very Good (VG)',
      G_PLUS: 'Good Plus (G+)',
      G: 'Good (G)',
      F: 'Fair (F)',
      P: 'Poor (P)'
    };
    const key = conditionToKey[condition];
    return key ? prices[key] : null;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="backdrop" onclick={handleBackdropClick} role="presentation">
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
        use:enhance={({ formElement, cancel }) => {
          // If the background cover fetch is still in flight, hold this
          // submit briefly so the record saves WITH its cover. Capped at 4s —
          // past that we save without a cover rather than hang the user.
          if (pendingCover) {
            cancel();
            submitting = true;
            Promise.race([pendingCover, new Promise((r) => setTimeout(r, 4000))]).then(
              async () => {
                pendingCover = null;
                submitting = false;
                await tick(); // flush the hidden image_url input before resubmitting
                formElement.requestSubmit();
              }
            );
            return;
          }
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
        <input type="hidden" name="force" bind:value={forceCreate} />
        <input type="hidden" name="discogs_id" value={discogsId} />
        <input type="hidden" name="mbid" value={mbid} />
        <input type="hidden" name="image_url" value={imageUrl} />
        <input type="hidden" name="prices" value={prices ? JSON.stringify(prices) : ''} />
        <input type="hidden" name="tracklist" value={tracklistJson} />
        <!-- Collection memberships are only sent when the user actually changed them,
             so the dual-write doesn't silently re-shuffle a record's collections
             on routine edits. -->
        <input type="hidden" name="collections" value={membershipsDirty ? Array.from(memberCollectionIds).join(',') : ''} />

        <!-- ── Discogs panel ──────────────────────────── -->
        <div class="discogs-panel">
          {#if isLinked}
            <div class="linked-info">
              <div class="linked-dot"></div>
              <div class="linked-text">
                Linked to <a
                  href="https://www.discogs.com/release/{discogsId}"
                  target="_blank"
                  rel="noopener noreferrer">Discogs release #{discogsId}</a
                >
              </div>
              <div class="linked-actions">
                {#if isEdit}
                  <button
                    type="button"
                    class="link-btn"
                    onclick={refreshPrices}
                    disabled={refreshingPrices}
                    title="Pull latest prices from Discogs"
                  >
                    {refreshingPrices ? '…' : '↻ Refresh prices'}
                  </button>
                {/if}
                <button type="button" class="link-btn" onclick={() => (showSearch = !showSearch)}>
                  {showSearch ? 'Hide search' : 'Re-link'}
                </button>
                <button type="button" class="link-btn danger" onclick={unlinkDiscogs}>
                  Unlink
                </button>
              </div>
            </div>
          {:else}
            <button
              type="button"
              class="link-cta"
              onclick={() => (showSearch = !showSearch)}
            >
              {showSearch ? 'Hide search' : 'Search to autofill'}
            </button>
          {/if}

          {#if showSearch}
            <div class="search-panel">
              {#if autofilling}
                <div class="autofill-loading">
                  <span class="spinner"></span> Fetching release details…
                </div>
              {:else}
                <MusicBrainzSearch onselect={handleMusicBrainzSelect} />
              {/if}
            </div>
          {/if}
        </div>

        <!-- ── Cover image ─────────────────────────────── -->
        <div class="cover-block">
          {#if imageUrl && !showUpload}
            <div class="cover-preview">
              <img src={imageUrl} alt="Cover" />
            </div>
            <div class="cover-actions">
              <button type="button" class="link-btn small" onclick={() => (showUpload = true)}>
                Replace
              </button>
              <button type="button" class="link-btn small danger" onclick={removeCover}>
                Remove cover
              </button>
            </div>
          {:else if showUpload}
            <CoverUpload
              {supabase}
              userId={page.data.user?.id}
              recordId={record?.id ?? null}
              onuploaded={handleCoverUploaded}
              oncancel={() => (showUpload = false)}
            />
          {:else}
            <div class="cover-empty">
              <svg class="cover-empty-icon" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                <!-- Album frame with center hole — neutral, theme-aware -->
                <rect x="10" y="10" width="44" height="44" rx="2" />
                <circle cx="32" cy="32" r="11" />
                <circle cx="32" cy="32" r="2.5" fill="currentColor" />
              </svg>
              <div class="cover-empty-text">No cover image yet.</div>
              <button type="button" class="link-btn small" onclick={() => (showUpload = true)}>
                Upload one
              </button>
            </div>
          {/if}
        </div>

        <!-- ── Main fields ────────────────────────────── -->
        <div class="form-grid">
          <div class="field span-2">
            <label for="artist">Artist <span class="req">*</span></label>
            <input id="artist" name="artist" type="text" bind:value={artist} maxlength="200" required placeholder="e.g. Nirvana" />
          </div>
          <div class="field span-2">
            <label for="title">Title <span class="req">*</span></label>
            <input id="title" name="title" type="text" bind:value={title} maxlength="300" required placeholder="e.g. Nevermind" />
          </div>

          <div class="field">
            <label for="label">Label</label>
            <input id="label" name="label" type="text" bind:value={label} maxlength="200" placeholder="DGC" />
          </div>
          <div class="field">
            <label for="year">Year</label>
            <input id="year" name="year" type="text" bind:value={year} maxlength="12" placeholder="1991" />
          </div>

          <div class="field span-2">
            <label for="genre">Genre</label>
            <input id="genre" name="genre" type="text" bind:value={genre} maxlength="100" placeholder="Rock" />
          </div>

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
            {#if matchingPrice}
              <div class="field-hint price-hint">
                Discogs suggests <strong>€{Number(matchingPrice.value ?? matchingPrice).toFixed(2)}</strong> at this condition
              </div>
            {:else if isLinked && priceWarning === 'seller_settings'}
              <div class="field-hint warn">
                Discogs prices unavailable —
                <a href="https://www.discogs.com/settings/seller" target="_blank" rel="noopener noreferrer">fill out your seller settings</a>
                to unlock them.
              </div>
            {:else if isLinked && priceWarning === 'unavailable'}
              <div class="field-hint">No price data available for this release.</div>
            {/if}
          </div>

          <div class="field span-2">
            <label for="purchase_price">What you paid</label>
            <div class="price-input">
              <span class="currency">€</span>
              <input id="purchase_price" name="purchase_price" type="text" inputmode="decimal" bind:value={purchasePrice} placeholder="0.00" />
            </div>
          </div>

          <div class="field span-2">
            <label for="value_override">Current value (override)</label>
            <div class="price-input">
              <span class="currency">€</span>
              <input id="value_override" name="value_override" type="text" inputmode="decimal" bind:value={valueOverride} placeholder={matchingPrice ? `Default: ${Number(matchingPrice.value ?? matchingPrice).toFixed(0)}` : 'optional'} />
            </div>
          </div>

          <div class="field span-4">
            <label for="tags">Tags</label>
            <div class="tag-input-wrap">
              <input
                id="tags"
                name="tags"
                type="text"
                bind:value={tagsText}
                oninput={onTagInput}
                onblur={() => setTimeout(() => (tagSuggestions = []), 150)}
                placeholder="grunge, 90s, favorites"
                autocomplete="off"
              />
              {#if tagSuggestions.length > 0}
                <div class="tag-suggestions" role="listbox">
                  {#each tagSuggestions as s}
                    <button
                      type="button"
                      class="tag-suggestion"
                      onmousedown={(e) => { e.preventDefault(); applyTagSuggestion(s.tag); }}
                    >
                      <span>{s.tag}</span>
                      <span class="tag-count">{s.count}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <div class="field-hint">Separate with commas. Up to 30 tags.</div>
          </div>

          <div class="field span-4">
            <label for="notes">Notes</label>
            <textarea id="notes" name="notes" bind:value={notes} rows="3" placeholder="Where you found it, who gave it to you, anything worth remembering."></textarea>
          </div>
        </div>

        <!-- ── Tracklist ─────────────────────────────── -->
        <div class="tracklist-section">
          <div class="section-header">
            <h3>Tracklist</h3>
            <button type="button" class="link-btn small" onclick={addTrackRow}>+ Add track</button>
          </div>

          {#if tracksLoading}
            <div class="tracks-loading"><span class="spinner small"></span> Loading…</div>
          {:else if tracks.length === 0}
            <div class="tracks-empty">No tracks yet. Use autofill above, or add tracks manually.</div>
          {:else}
            <div class="track-rows">
              {#each tracks as track, idx (idx)}
                <div class="track-row">
                  <input
                    class="track-pos"
                    type="text"
                    value={track.position ?? ''}
                    oninput={(e) => updateTrackField(idx, 'position', e.currentTarget.value)}
                    maxlength="12"
                    placeholder="A1"
                    aria-label="Position"
                  />
                  <input
                    class="track-title"
                    type="text"
                    value={track.title ?? ''}
                    oninput={(e) => updateTrackField(idx, 'title', e.currentTarget.value)}
                    maxlength="300"
                    placeholder="Track title"
                    aria-label="Title"
                  />
                  <input
                    class="track-dur"
                    type="text"
                    value={track.duration ?? ''}
                    oninput={(e) => updateTrackField(idx, 'duration', e.currentTarget.value)}
                    maxlength="12"
                    placeholder="3:42"
                    aria-label="Duration"
                  />
                  <div class="track-actions">
                    <button type="button" class="move-btn" onclick={() => moveTrack(idx, -1)} disabled={idx === 0} aria-label="Move up">↑</button>
                    <button type="button" class="move-btn" onclick={() => moveTrack(idx, 1)} disabled={idx === tracks.length - 1} aria-label="Move down">↓</button>
                    <button type="button" class="remove-btn" onclick={() => removeTrackRow(idx)} aria-label="Remove">✕</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- ── In collections ──────────────────────────── -->
        {#if allCollections.length > 1}
          <div class="memberships-section">
            <div class="section-header">
              <h3>In collections</h3>
              {#if membershipsLoading}
                <span class="loading-tag"><span class="spinner small"></span></span>
              {/if}
            </div>
            <p class="memberships-hint">
              This record can live in more than one collection. Toggle below to add or remove
              it from your other collections. {#if currentCollectionId}The current collection is locked here —
              use <em>"Remove from this collection"</em> on the card itself for that.{/if}
            </p>
            <div class="memberships-list">
              {#each allCollections as coll}
                {@const isCurrent = coll.id === currentCollectionId}
                {@const isMember = memberCollectionIds.has(coll.id)}
                <label class="member-row" class:locked={isCurrent} class:active={isMember}>
                  <input
                    type="checkbox"
                    checked={isMember}
                    disabled={isCurrent}
                    onchange={() => toggleMembership(coll.id)}
                  />
                  <span class="member-name">{coll.name}</span>
                  {#if isCurrent}
                    <span class="member-badge">current</span>
                  {/if}
                </label>
              {/each}
            </div>
          </div>
        {/if}

        {#if errorMsg}
          <div class="error">{errorMsg}</div>
        {/if}

        {#if showDuplicateWarning}
          <div class="duplicate-warning">
            <div class="dup-header">
              <strong>Looks like you may already have this.</strong>
              <span class="dup-subtitle">Found {duplicates.length} similar record{duplicates.length === 1 ? '' : 's'}:</span>
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
              <button type="button" class="btn ghost" onclick={() => (showDuplicateWarning = false)}>Cancel</button>
              <button type="submit" class="btn primary" onclick={() => (forceCreate = 'true')}>Add anyway</button>
            </div>
          </div>
        {/if}

        <footer class="modal-footer" class:hidden={showDuplicateWarning}>
          <button type="button" class="btn ghost" onclick={close} disabled={submitting}>Cancel</button>
          <button type="submit" class="btn primary" disabled={submitting || !artist.trim() || !title.trim()}>
            {submitting ? (isEdit ? 'Saving…' : 'Adding…') : isEdit ? 'Save changes' : 'Add to collection'}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: var(--overlay);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 40px 20px;
    overflow-y: auto;
    animation: fadeIn 0.18s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    width: 100%; max-width: 720px;
    box-shadow: 0 30px 80px var(--shadow);
    animation: slideUp 0.22s ease;
  }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  .modal-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 16px; padding: 28px 30px 22px;
    border-bottom: 1px solid var(--groove);
  }
  .modal-eyebrow {
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 8px;
  }
  h2 {
    font-family: var(--ff-display); font-size: 28px;
    font-weight: 400; line-height: 1.05; color: var(--ink);
  }
  h2 em { font-style: italic; color: var(--accent); font-weight: 500; }

  .close-btn {
    background: none; border: 1px solid var(--groove);
    border-radius: 50%;
    width: 36px; height: 36px;
    color: var(--ink-2); font-size: 14px; flex-shrink: 0;
    transition: background var(--t), color var(--t), border-color var(--t);
  }
  .close-btn:hover:not(:disabled) {
    background: var(--bg-3); color: var(--ink); border-color: var(--ink-3);
  }

  form { padding: 22px 30px 26px; }

  /* ── Discogs panel ──────────────────────────────── */
  .discogs-panel { margin-bottom: 18px; }

  .link-cta {
    width: 100%;
    padding: 11px 16px;
    background: var(--bg-3);
    border: 1px dashed var(--groove);
    border-radius: var(--radius);
    color: var(--ink-2);
    font-family: var(--ff-mono); font-size: 11px;
    letter-spacing: 0.12em; text-transform: uppercase;
    cursor: pointer;
    transition: border-color var(--t), color var(--t);
  }
  .link-cta:hover { border-color: var(--accent); color: var(--accent); }

  .linked-info {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    background: rgba(127, 182, 133, 0.08);
    border: 1px solid var(--success);
    border-radius: var(--radius);
  }
  .linked-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 3px rgba(127, 182, 133, 0.18);
    flex-shrink: 0;
  }
  .linked-text {
    flex: 1;
    font-family: var(--ff-display);
    font-size: 13px;
    color: var(--ink-2);
  }
  .linked-text a {
    color: var(--ink);
    border-bottom: 1px solid var(--groove);
    transition: border-color var(--t);
  }
  .linked-text a:hover { border-color: var(--accent); }
  .linked-actions { display: flex; gap: 6px; flex-shrink: 0; }

  .link-btn {
    background: transparent;
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    padding: 6px 10px;
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-2);
    cursor: pointer;
    transition: color var(--t), border-color var(--t);
  }
  .link-btn:hover { color: var(--ink); border-color: var(--ink-3); }
  .link-btn.danger:hover { color: var(--danger); border-color: var(--danger); }
  .link-btn.small { padding: 4px 8px; font-size: 8px; }

  .search-panel { margin-top: 12px; }
  .autofill-loading {
    display: flex; align-items: center; gap: 10px;
    padding: 18px;
    color: var(--ink-2);
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 14px;
  }

  .spinner {
    width: 14px; height: 14px;
    border: 2px solid var(--groove);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .spinner.small { width: 10px; height: 10px; border-width: 1.5px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Cover block ────────────────────────────────── */
  .cover-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
  }
  .cover-preview {
    width: 120px;
    /* Height is content-driven now (original ratio).
       For square covers this still renders as 120px. */
    max-width: 200px;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--groove);
    background: var(--bg-3);
  }
  .cover-preview img {
    display: block;
    width: 100%;
    max-height: 200px;
    object-fit: contain;  /* Preserve aspect — letterbox if needed */
  }
  .cover-actions {
    display: flex;
    gap: 6px;
  }
  .cover-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px;
    width: 100%;
    max-width: 360px;
    background: var(--bg-3);
    border: 1px dashed var(--groove);
    border-radius: var(--radius);
  }
  .cover-empty-icon {
    width: 36px; height: 36px;
    color: var(--ink-3);
    display: block;
  }
  .cover-empty-text {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
  }

  /* ── Form grid ──────────────────────────────────── */
  .form-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  }

  .field {
    display: flex; flex-direction: column; gap: 6px;
    grid-column: span 4;
  }
  .field.span-2 { grid-column: span 2; }
  .field.span-4 { grid-column: span 4; }

  label {
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-3);
  }
  .req { color: var(--accent); margin-left: 2px; }

  input[type='text'], input[type='search'], select, textarea {
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
  input:focus, select:focus, textarea:focus {
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

  .price-input { position: relative; }
  .currency {
    position: absolute; left: 14px; top: 50%;
    transform: translateY(-50%);
    color: var(--ink-3);
    font-family: var(--ff-display); font-size: 16px;
    pointer-events: none;
  }
  .price-input input { padding-left: 28px; }

  .field-hint {
    font-family: var(--ff-display); font-style: italic;
    font-size: 12px; color: var(--ink-3); margin-top: 2px;
  }
  .field-hint.warn { color: var(--accent); }
  .field-hint.warn a { color: var(--accent); border-bottom: 1px solid; }
  .field-hint.price-hint { color: var(--success); }
  .field-hint.price-hint strong { color: var(--success); font-weight: 600; font-style: normal; }

  /* ── Tracklist editor ───────────────────────────── */
  .tracklist-section {
    margin-top: 22px;
    padding-top: 22px;
    border-top: 1px solid var(--groove);
  }
  .section-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px;
  }
  .section-header h3 {
    font-family: var(--ff-display); font-size: 18px;
    font-weight: 500; color: var(--ink);
  }
  .loading-tag {
    display: inline-flex;
    align-items: center;
    color: var(--ink-3);
    font-size: 11px;
  }

  /* ── In Collections membership UI ──────────────── */
  .memberships-section {
    margin-top: 22px;
    padding-top: 22px;
    border-top: 1px solid var(--groove);
  }
  .memberships-hint {
    font-family: var(--ff-display); font-style: italic;
    font-size: 12px;
    color: var(--ink-3);
    margin-bottom: 12px;
  }
  .memberships-hint em { color: var(--ink-2); font-style: italic; }
  .memberships-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .member-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color var(--t), background var(--t);
  }
  .member-row:hover:not(.locked) { border-color: var(--ink-3); }
  .member-row.active {
    border-color: var(--accent);
    background: var(--accent-glow);
  }
  .member-row.locked {
    cursor: not-allowed;
    opacity: 0.85;
  }
  .member-row input[type='checkbox'] {
    margin: 0;
    accent-color: var(--accent);
    flex-shrink: 0;
  }
  .member-name {
    flex: 1;
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
  }
  .member-badge {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    padding: 2px 8px;
    border: 1px solid var(--accent);
    border-radius: 99px;
  }
  .tracks-empty, .tracks-loading {
    padding: 14px;
    text-align: center;
    color: var(--ink-3);
    font-family: var(--ff-display); font-style: italic;
    font-size: 13px;
    background: var(--bg-3);
    border-radius: var(--radius);
  }
  .tracks-loading {
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }

  .track-rows {
    display: flex; flex-direction: column; gap: 6px;
  }
  .track-row {
    display: flex; gap: 6px; align-items: center;
    width: 100%;
  }
  .track-row input {
    padding: 8px 10px; font-size: 14px;
    min-width: 0;  /* critical: allow flexbox to shrink inputs below their default width */
  }
  .track-pos { width: 60px; flex: 0 0 60px; }
  .track-title { flex: 1 1 auto; min-width: 0; }
  .track-dur { width: 80px; flex: 0 0 80px; }
  .track-actions {
    display: flex; gap: 2px; flex-shrink: 0;
  }
  .move-btn, .remove-btn {
    width: 28px; height: 32px;
    background: transparent;
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    color: var(--ink-3);
    cursor: pointer;
    font-size: 11px;
    transition: color var(--t), border-color var(--t);
  }
  .move-btn:hover:not(:disabled), .remove-btn:hover {
    color: var(--ink); border-color: var(--ink-3);
  }
  .move-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .remove-btn:hover { color: var(--danger); border-color: var(--danger); }

  /* ── Error + duplicate warning ─────────────────── */
  .error {
    margin-top: 18px; padding: 11px 14px;
    background: rgba(198, 74, 74, 0.12);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius);
    font-size: 13px;
  }

  /* ── Tag autocomplete ─────────────────────────── */
  .tag-input-wrap { position: relative; }
  .tag-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--bg-2);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px var(--shadow);
    overflow: hidden;
    z-index: 5;
  }
  .tag-suggestion {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--groove);
    color: var(--ink);
    font-family: var(--ff-display);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
    transition: background var(--t);
  }
  .tag-suggestion:last-child { border-bottom: none; }
  .tag-suggestion:hover { background: var(--bg-3); }
  .tag-count {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }

  .modal-footer {
    display: flex; justify-content: flex-end; gap: 10px;
    margin-top: 22px; padding-top: 22px;
    border-top: 1px solid var(--groove);
  }
  .modal-footer.hidden { display: none; }

  .btn {
    padding: 11px 22px;
    border-radius: var(--radius);
    font-family: var(--ff-mono); font-size: 11px;
    font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 1px solid transparent;
    transition: background var(--t), color var(--t), transform var(--t);
    cursor: pointer;
  }
  .btn.primary { background: var(--accent); color: var(--bg); }
  .btn.primary:hover:not(:disabled) { background: var(--ink); transform: translateY(-1px); }
  .btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn.ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--groove);
  }
  .btn.ghost:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-3); }

  .duplicate-warning {
    margin-top: 18px;
    padding: 16px 18px;
    background: var(--accent-glow);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
  }
  .dup-header { margin-bottom: 10px; }
  .dup-header strong {
    font-family: var(--ff-display); font-size: 15px;
    font-weight: 500; color: var(--accent);
    display: block; margin-bottom: 2px;
  }
  .dup-subtitle {
    font-family: var(--ff-display); font-style: italic;
    font-size: 12px; color: var(--ink-2);
  }
  .dup-list {
    list-style: none; padding: 0;
    margin: 0 0 12px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .dup-list li {
    padding: 7px 10px;
    background: var(--bg-3);
    border-radius: var(--radius);
    font-size: 12px;
    font-family: var(--ff-display);
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
  .dup-artist {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent);
  }
  .dup-title { color: var(--ink); }
  .dup-year, .dup-sep { color: var(--ink-3); font-size: 11px; }
  .dup-badge {
    margin-left: auto;
    font-family: var(--ff-mono); font-size: 8px;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ink-3);
    border: 1px solid var(--groove);
    border-radius: 99px;
    padding: 1px 6px;
  }
  .dup-actions {
    display: flex; justify-content: flex-end; gap: 8px;
  }

  @media (max-width: 640px) {
    .backdrop { padding: 0; align-items: stretch; }
    .modal { border-radius: 0; max-width: 100%; min-height: 100vh; }
    .modal-header { padding: 22px 22px 18px; }
    form { padding: 20px 22px 24px; }
    h2 { font-size: 22px; }
    .form-grid { gap: 12px; }
    .field.span-2 { grid-column: span 4; }
    .linked-info { flex-wrap: wrap; }
    .linked-actions { width: 100%; justify-content: flex-end; }
    .track-pos { width: 48px; }
    .track-dur { width: 60px; }
  }
</style>
