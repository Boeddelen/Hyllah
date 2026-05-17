<script>
  /**
   * DiscogsSearch — search bar + results panel for finding Discogs releases.
   *
   * Props:
   *  - onselect: (release) => void — called when user picks a result.
   *    `release` is the raw Discogs search result with id, title, year,
   *    label, format, country, thumb, etc.
   *  - placeholder?: string
   *  - autofocus?: boolean
   */
  let { onselect, placeholder = 'Search Discogs (artist, title, label...)', autofocus = false } = $props();

  let query = $state('');
  let results = $state([]);
  let loading = $state(false);
  let error = $state('');

  // Debounce timer — search fires 300ms after the user stops typing
  let debounceId;

  function clearResults() {
    results = [];
    error = '';
  }

  async function runSearch(q) {
    if (q.length < 3) {
      clearResults();
      return;
    }
    loading = true;
    error = '';
    try {
      const res = await fetch(`/api/discogs/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 403 && body.includes('NOT_CONNECTED')) {
          error = 'Discogs is not connected. Connect it in Settings.';
        } else if (res.status === 401) {
          error = 'Please sign in again.';
        } else {
          error = `Search failed (${res.status})`;
        }
        clearResults();
        return;
      }
      const data = await res.json();
      results = data.results ?? [];
    } catch (err) {
      console.error('Discogs search error:', err);
      error = 'Could not reach Discogs. Try again.';
      results = [];
    } finally {
      loading = false;
    }
  }

  function onInput() {
    clearTimeout(debounceId);
    if (!query.trim()) {
      clearResults();
      return;
    }
    debounceId = setTimeout(() => runSearch(query.trim()), 300);
  }

  function handleSelect(result) {
    onselect?.(result);
    // Clear after selection so the modal can refocus on form fields
    query = '';
    results = [];
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      clearResults();
      query = '';
    }
  }

  function fmtFormat(formats) {
    if (!Array.isArray(formats) || formats.length === 0) return '';
    return formats.map((f) => f.name ?? f).filter(Boolean).join(', ');
  }
</script>

<div class="discogs-search">
  <div class="search-input-wrap">
    <span class="search-icon" aria-hidden="true">🔍</span>
    <input
      type="search"
      bind:value={query}
      oninput={onInput}
      onkeydown={handleKey}
      {placeholder}
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
    />
    {#if loading}
      <span class="search-spinner" aria-label="Searching"></span>
    {/if}
  </div>

  {#if error}
    <div class="search-error">{error}</div>
  {/if}

  {#if results.length > 0}
    <div class="search-results" role="listbox">
      {#each results as r (r.id)}
        <button
          type="button"
          class="result"
          onclick={() => handleSelect(r)}
          role="option"
          aria-selected="false"
        >
          <div class="result-thumb">
            {#if r.thumb}
              <img src={r.thumb} alt="" loading="lazy" />
            {:else}
              <div class="result-thumb-placeholder">♪</div>
            {/if}
          </div>
          <div class="result-info">
            <div class="result-title">{r.title}</div>
            <div class="result-meta">
              {[r.year, fmtFormat(r.format), r.country].filter(Boolean).join(' · ')}
            </div>
            {#if r.label?.length}
              <div class="result-label">{Array.isArray(r.label) ? r.label[0] : r.label}</div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {:else if query.length >= 3 && !loading && !error}
    <div class="search-empty">No results.</div>
  {/if}
</div>

<style>
  .discogs-search { position: relative; }

  .search-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    pointer-events: none;
    opacity: 0.6;
    font-size: 13px;
  }

  .search-input-wrap input {
    width: 100%;
    padding: 11px 14px 11px 40px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
    transition: border-color var(--t);
  }

  .search-input-wrap input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .search-spinner {
    position: absolute;
    right: 14px;
    width: 14px;
    height: 14px;
    border: 2px solid var(--groove);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .search-error {
    margin-top: 8px;
    padding: 9px 14px;
    background: rgba(198, 74, 74, 0.1);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius);
    font-size: 13px;
  }

  .search-empty {
    margin-top: 8px;
    padding: 9px 14px;
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
    text-align: center;
  }

  .search-results {
    margin-top: 10px;
    max-height: 360px;
    overflow-y: auto;
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    background: var(--bg-3);
  }

  .result {
    width: 100%;
    display: flex;
    gap: 12px;
    padding: 10px 12px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--groove);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: background var(--t);
  }

  .result:last-child { border-bottom: none; }
  .result:hover { background: var(--bg-2); }
  .result:focus-visible {
    outline: none;
    background: var(--bg-2);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .result-thumb {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    background: var(--bg-2);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .result-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .result-thumb-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px;
    color: var(--ink-3);
  }

  .result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
  }

  .result-title {
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-meta {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-label {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
