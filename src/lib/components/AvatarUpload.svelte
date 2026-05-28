<script>
  import CoverUpload from './CoverUpload.svelte';

  let { supabase, userId, onUploadComplete } = $props();

  let showUpload = $state(false);
  let cropShape = $state('circle'); // 'circle' | 'square'
</script>

{#if showUpload}
  <div class="overlay" onclick={() => (showUpload = false)}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h3>Upload avatar</h3>
        <button class="close-btn" onclick={() => (showUpload = false)} aria-label="Close">✕</button>
      </div>

      <div class="crop-toggle">
        <label class="toggle-option" class:active={cropShape === 'circle'}>
          <input
            type="radio"
            name="cropShape"
            value="circle"
            bind:group={cropShape}
          />
          <span>Circle</span>
        </label>
        <label class="toggle-option" class:active={cropShape === 'square'}>
          <input
            type="radio"
            name="cropShape"
            value="square"
            bind:group={cropShape}
          />
          <span>Square</span>
        </label>
      </div>

      <CoverUpload
        {supabase}
        {userId}
        bucket="avatars"
        cropToSquare={cropShape === 'square'}
        maxSizeMb={2}
        onuploaded={(url) => {
          showUpload = false;
          if (onUploadComplete) onUploadComplete(url);
        }}
        oncancel={() => (showUpload = false)}
      />
    </div>
  </div>
{/if}

<button class="btn ghost small" onclick={() => (showUpload = true)}>
  Upload avatar
</button>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
  }
  .modal {
    background: var(--bg);
    border-radius: var(--radius-lg);
    max-width: 480px;
    width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--groove);
  }
  .modal-header h3 {
    font-family: var(--ff-display);
    font-size: 20px;
    margin: 0;
    color: var(--ink);
  }
  .close-btn {
    background: transparent;
    border: none;
    font-size: 20px;
    color: var(--ink-3);
    cursor: pointer;
    padding: 4px 8px;
    transition: color var(--t);
  }
  .close-btn:hover {
    color: var(--ink);
  }

  .crop-toggle {
    display: flex;
    gap: 8px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--groove);
  }
  .toggle-option {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color var(--t), background var(--t);
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink-2);
  }
  .toggle-option input {
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
  .toggle-option.active {
    border-color: var(--accent);
    background: var(--accent-glow);
    color: var(--ink);
  }

  .btn {
    padding: 9px 14px;
    font-size: 12px;
  }
</style>
