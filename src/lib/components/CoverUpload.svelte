<script>
  /**
   * CoverUpload — file picker → optional crop → compress → upload.
   *
   * Workflow:
   *  1. User picks a file
   *  2. We read it into an Image to know its dimensions
   *  3. If "Original ratio" toggled OFF, show a square cropper (pan + zoom)
   *  4. Click Upload → render to canvas, encode as WebP, upload to Supabase
   *  5. Emit the resulting public URL via onuploaded()
   *
   * Props:
   *  - supabase: the browser Supabase client (from page data)
   *  - userId:   current user's id (for the storage path)
   *  - bucket:   storage bucket name (default: 'covers'; can be 'avatars' etc.)
   *  - recordId: record id (for the storage path); if null, uses a tmp id
   *  - cropToSquare: force square crop on upload (toggle override)
   *  - maxSizeMb: max file size in MB (default: 2)
   *  - onuploaded: (url: string) => void
   *  - oncancel?: () => void
   */
  let { supabase, userId, bucket = 'covers', recordId = null, cropToSquare: forceCropToSquare = false, maxSizeMb = 2, onuploaded, oncancel } = $props();

  // Limits — keep these aligned with the storage bucket's file_size_limit
  const MAX_DIMENSION = 1200;       // Longest edge after compression
  const TARGET_QUALITY = 0.82;      // WebP quality
  const ACCEPT_TYPES = 'image/jpeg,image/png,image/webp';
  const MAX_SIZE_BYTES = maxSizeMb * 1024 * 1024;

  let stage = $state('pick');       // 'pick' | 'edit' | 'uploading'
  let errorMsg = $state('');
  let progressPct = $state(0);

  // Image being edited
  let imgEl = $state(null);         // <img> reference for the source
  let imgSrc = $state('');
  let imgNaturalW = $state(0);
  let imgNaturalH = $state(0);

  // Crop settings
  let cropToSquare = $state(forceCropToSquare);  // Respect forced parameter
  let zoom = $state(1);              // 1 = fit-cover; values >1 zoom in
  let offsetX = $state(0);           // pan offsets in % of the cropper viewport
  let offsetY = $state(0);

  // Drag state
  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartOffX = 0;
  let dragStartOffY = 0;

  function reset() {
    stage = 'pick';
    errorMsg = '';
    progressPct = 0;
    imgSrc = '';
    imgNaturalW = 0;
    imgNaturalH = 0;
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    cropToSquare = false;
  }

  function handleFileChange(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      errorMsg = 'Please pick an image file (JPEG, PNG, or WebP).';
      return;
    }
    // 10MB hard cap on the raw file before compression. Anything larger
    // is almost always a phone HDR shot that compresses fine, but we want
    // to bail early if someone tries a 50MB tiff.
    if (file.size > 10 * 1024 * 1024) {
      errorMsg = 'File is too large. Please pick something under 10 MB.';
      return;
    }
    errorMsg = '';

    const reader = new FileReader();
    reader.onload = () => {
      imgSrc = reader.result?.toString() ?? '';
      // Once loaded, measure
      const probe = new Image();
      probe.onload = () => {
        imgNaturalW = probe.naturalWidth;
        imgNaturalH = probe.naturalHeight;
        stage = 'edit';
      };
      probe.onerror = () => {
        errorMsg = 'Could not read that image.';
      };
      probe.src = imgSrc;
    };
    reader.onerror = () => {
      errorMsg = 'Could not read that file.';
    };
    reader.readAsDataURL(file);
  }

  // ── Pan + zoom (only used when cropToSquare is on) ──
  function startDrag(e) {
    if (!cropToSquare) return;
    e.preventDefault();
    dragging = true;
    const point = e.touches?.[0] ?? e;
    dragStartX = point.clientX;
    dragStartY = point.clientY;
    dragStartOffX = offsetX;
    dragStartOffY = offsetY;
  }
  function moveDrag(e) {
    if (!dragging) return;
    const point = e.touches?.[0] ?? e;
    const dx = point.clientX - dragStartX;
    const dy = point.clientY - dragStartY;
    // Pan as % of cropper viewport (300px assumed)
    offsetX = clamp(dragStartOffX + (dx / 3), -50, 50);
    offsetY = clamp(dragStartOffY + (dy / 3), -50, 50);
  }
  function endDrag() { dragging = false; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // ── Render to canvas + upload ──
  async function uploadImage() {
    errorMsg = '';
    stage = 'uploading';
    progressPct = 5;
    try {
      // Build output canvas
      const canvas = document.createElement('canvas');
      const sourceImg = new Image();
      sourceImg.src = imgSrc;
      await new Promise((res, rej) => {
        sourceImg.onload = res;
        sourceImg.onerror = rej;
      });

      let targetW, targetH;
      if (cropToSquare) {
        // Square crop: use the shorter dimension, then apply zoom + pan
        const minDim = Math.min(imgNaturalW, imgNaturalH);
        const cropSize = minDim / zoom;
        const maxPanX = (imgNaturalW - cropSize) / 2;
        const maxPanY = (imgNaturalH - cropSize) / 2;
        const cropX = (imgNaturalW - cropSize) / 2 + (-offsetX / 50) * maxPanX;
        const cropY = (imgNaturalH - cropSize) / 2 + (-offsetY / 50) * maxPanY;

        const outSize = Math.min(MAX_DIMENSION, Math.round(cropSize));
        canvas.width = outSize;
        canvas.height = outSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unsupported in this browser.');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceImg, cropX, cropY, cropSize, cropSize, 0, 0, outSize, outSize);
        targetW = outSize;
        targetH = outSize;
      } else {
        // Original ratio: scale down so the longest edge is MAX_DIMENSION
        const ratio = Math.min(1, MAX_DIMENSION / Math.max(imgNaturalW, imgNaturalH));
        targetW = Math.round(imgNaturalW * ratio);
        targetH = Math.round(imgNaturalH * ratio);
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unsupported in this browser.');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceImg, 0, 0, targetW, targetH);
      }

      progressPct = 25;

      // Encode as WebP
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
          'image/webp',
          TARGET_QUALITY
        );
      });

      progressPct = 45;

      // Path: {bucket}/{userId}/{recordId-or-tmp}-{rand}.webp
      // The random suffix ensures a fresh URL each upload (cache busting).
      const tmpId = recordId ?? `tmp-${Date.now().toString(36)}`;
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `${userId}/${tmpId}-${rand}.webp`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, blob, {
          contentType: 'image/webp',
          upsert: false,
          cacheControl: '604800'  // 7 days — file path includes random suffix anyway
        });
      if (upErr) throw upErr;

      progressPct = 90;

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error('Could not resolve uploaded image URL.');

      progressPct = 100;
      onuploaded?.(publicUrl);
      reset();
    } catch (err) {
      console.error('cover upload failed', err);
      errorMsg = err?.message ?? 'Upload failed';
      stage = 'edit';
      progressPct = 0;
    }
  }

  function cancel() {
    reset();
    oncancel?.();
  }

  // Computed CSS transform for the preview when cropping
  let cropImgStyle = $derived(
    cropToSquare
      ? `transform: scale(${zoom}) translate(${offsetX}%, ${offsetY}%);`
      : ''
  );
</script>

<div class="cover-upload">
  {#if stage === 'pick'}
    <label class="picker">
      <input
        type="file"
        accept={ACCEPT_TYPES}
        onchange={handleFileChange}
      />
      <div class="picker-cta">
        <svg class="picker-icon" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <!-- Frame -->
          <rect x="6" y="10" width="36" height="28" rx="2" />
          <!-- Mountain -->
          <polyline points="6,32 18,22 26,30 34,24 42,32" />
          <!-- Sun -->
          <circle cx="34" cy="18" r="2.5" />
        </svg>
        <span class="picker-title">Upload your own cover</span>
        <span class="picker-hint">JPEG, PNG, or WebP — up to 10 MB</span>
      </div>
    </label>
    {#if errorMsg}<div class="error">{errorMsg}</div>{/if}
    <div class="actions">
      <button type="button" class="btn ghost small" onclick={cancel}>Cancel</button>
    </div>
  {:else if stage === 'edit'}
    <div class="edit-stage">
      <label class="toggle">
        <input type="checkbox" bind:checked={cropToSquare} />
        <span>Crop to square</span>
        <span class="toggle-hint">{cropToSquare ? 'Pan and zoom to position' : 'Preserves the original aspect ratio'}</span>
      </label>

      {#if cropToSquare}
        <div
          class="cropper"
          onmousedown={startDrag}
          onmousemove={moveDrag}
          onmouseup={endDrag}
          onmouseleave={endDrag}
          ontouchstart={startDrag}
          ontouchmove={moveDrag}
          ontouchend={endDrag}
          role="presentation"
        >
          <img
            bind:this={imgEl}
            src={imgSrc}
            alt="Crop preview"
            class="cropper-img"
            style={cropImgStyle}
            draggable="false"
          />
        </div>
        <div class="zoom-row">
          <span class="zoom-label">Zoom</span>
          <input
            type="range"
            min="1" max="3" step="0.05"
            bind:value={zoom}
          />
        </div>
      {:else}
        <div class="preview-frame">
          <img src={imgSrc} alt="Preview" class="preview-img" />
        </div>
      {/if}

      {#if errorMsg}<div class="error">{errorMsg}</div>{/if}

      <div class="actions">
        <button type="button" class="btn ghost small" onclick={cancel}>Cancel</button>
        <button type="button" class="btn primary small" onclick={uploadImage}>Use this image</button>
      </div>
    </div>
  {:else if stage === 'uploading'}
    <div class="uploading">
      <div class="upload-msg">Uploading…</div>
      <div class="progress-track">
        <div class="progress-fill" style:width="{progressPct}%"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .cover-upload {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ── Picker ──────────────────────────────────── */
  .picker {
    display: block;
    cursor: pointer;
  }
  .picker input[type='file'] {
    position: absolute;
    width: 1px; height: 1px;
    opacity: 0; pointer-events: none;
  }
  .picker-cta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px;
    background: var(--bg-3);
    border: 1px dashed var(--groove);
    border-radius: var(--radius);
    text-align: center;
    transition: border-color var(--t), background var(--t);
  }
  .picker:hover .picker-cta {
    border-color: var(--accent);
  }
  .picker-icon {
    width: 32px; height: 32px;
    color: var(--ink-3);
    display: block;
  }
  .picker-title {
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
  }
  .picker-hint {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-3);
  }

  /* ── Edit stage ──────────────────────────────── */
  .edit-stage {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
    flex-wrap: wrap;
  }
  .toggle input { accent-color: var(--accent); }
  .toggle-hint {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-3);
    width: 100%;
    margin-left: 22px;
  }

  /* Square cropper */
  .cropper {
    position: relative;
    width: 100%;
    max-width: 300px;
    aspect-ratio: 1;
    margin: 0 auto;
    background: var(--bg-3);
    border-radius: var(--radius);
    overflow: hidden;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .cropper:active { cursor: grabbing; }
  .cropper-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform-origin: center;
    transition: transform 0.05s linear;
    pointer-events: none;
  }

  .zoom-row {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 300px;
    margin: 0 auto;
    width: 100%;
  }
  .zoom-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-3);
    flex-shrink: 0;
  }
  .zoom-row input[type='range'] {
    flex: 1;
    accent-color: var(--accent);
  }

  /* Original-ratio preview */
  .preview-frame {
    display: flex;
    justify-content: center;
    max-height: 320px;
  }
  .preview-img {
    max-width: 100%;
    max-height: 320px;
    border-radius: var(--radius);
    border: 1px solid var(--groove);
  }

  /* ── Uploading state ───────────────────────────── */
  .uploading {
    padding: 24px;
    text-align: center;
  }
  .upload-msg {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-2);
    margin-bottom: 12px;
  }
  .progress-track {
    width: 100%;
    height: 4px;
    background: var(--bg-3);
    border-radius: 99px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s ease;
  }

  /* ── Error + Buttons ──────────────────────────── */
  .error {
    padding: 9px 12px;
    background: rgba(198, 74, 74, 0.12);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius);
    font-size: 13px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    padding: 9px 16px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background var(--t), border-color var(--t), color var(--t);
  }
  .btn.primary { background: var(--accent); color: var(--bg); }
  .btn.primary:hover { background: var(--ink); }
  .btn.ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--groove);
  }
  .btn.ghost:hover { color: var(--ink); border-color: var(--ink-3); }
</style>
