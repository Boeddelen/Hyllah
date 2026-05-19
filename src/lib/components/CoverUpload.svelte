<script>
  /**
   * CoverUpload — file picker → optional canvas-based crop → compress → upload.
   *
   * iOS-safe: the preview during cropping is a <canvas> we redraw on every
   * pan/zoom change. Avoids CSS-transform quirks in Safari where touch
   * gestures didn't reliably reflow the previewed image.
   *
   * Props:
   *  - supabase: the browser Supabase client (from page data)
   *  - userId:   current user's id (for the storage path)
   *  - recordId: record id (for the storage path); if null, uses a tmp id
   *  - onuploaded: (url: string) => void
   *  - oncancel?: () => void
   */
  import { onDestroy } from 'svelte';

  let { supabase, userId, recordId = null, onuploaded, oncancel } = $props();

  // Limits — keep aligned with the storage bucket's file_size_limit
  const MAX_DIMENSION = 1200;       // Longest edge after compression
  const TARGET_QUALITY = 0.82;
  const ACCEPT_TYPES = 'image/jpeg,image/png,image/webp';
  const CROP_PREVIEW_PX = 300;      // CSS px of the square preview canvas

  let stage = $state('pick');       // 'pick' | 'edit' | 'uploading'
  let errorMsg = $state('');
  let progressPct = $state(0);

  // ── Source image (decoded once after pick) ─────────────────
  /** @type {HTMLImageElement | null} */
  let sourceImg = null;
  let imgSrc = $state('');
  let imgNaturalW = $state(0);
  let imgNaturalH = $state(0);
  // Bumped each time we replace the image, to force the preview canvas to redraw
  let imgVersion = $state(0);

  // ── Crop settings ──────────────────────────────────────────
  let cropToSquare = $state(false);  // OFF by default — preserve aspect
  let zoom = $state(1);              // 1 = fit; >1 zooms in
  // Pan offsets in [-1, 1] — fraction of the available pannable range
  let panX = $state(0);
  let panY = $state(0);

  // ── Drag state (for the cropper) ───────────────────────────
  let dragging = false;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;

  // ── Canvas references ──────────────────────────────────────
  /** @type {HTMLCanvasElement | null} */
  let previewCanvas = $state(null);
  /** @type {HTMLImageElement | null} */
  let previewImg = $state(null);

  // Bumps when we want the preview to redraw
  function redrawPreview() {
    if (!previewCanvas || !sourceImg || !cropToSquare) return;
    const dpr = window.devicePixelRatio || 1;
    const size = CROP_PREVIEW_PX;
    // Backing-store size accounts for DPR so it stays crisp on retina screens
    previewCanvas.width = size * dpr;
    previewCanvas.height = size * dpr;
    previewCanvas.style.width = size + 'px';
    previewCanvas.style.height = size + 'px';

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill background so transparent areas show theme color, not garbage
    ctx.fillStyle = getComputedStyle(previewCanvas).getPropertyValue('background-color') || '#000';
    ctx.fillRect(0, 0, size, size);

    // Compute the source rectangle we want to display
    const { sx, sy, sSize } = computeSourceRect();
    ctx.drawImage(sourceImg, sx, sy, sSize, sSize, 0, 0, size, size);
  }

  /**
   * Convert zoom + pan into a source rectangle on the original image.
   * zoom=1 means "fit the largest possible square crop" (= minDim).
   * zoom>1 narrows the crop window. pan is in [-1, 1] of the remaining slack.
   */
  function computeSourceRect() {
    const minDim = Math.min(imgNaturalW, imgNaturalH);
    const sSize = minDim / zoom;
    // Available pan slack: how much we can shift before the crop falls off the image
    const slackX = (imgNaturalW - sSize) / 2;
    const slackY = (imgNaturalH - sSize) / 2;
    const sx = (imgNaturalW - sSize) / 2 + panX * slackX;
    const sy = (imgNaturalH - sSize) / 2 + panY * slackY;
    return {
      sx: Math.max(0, Math.min(imgNaturalW - sSize, sx)),
      sy: Math.max(0, Math.min(imgNaturalH - sSize, sy)),
      sSize
    };
  }

  // Redraw whenever inputs change. $effect runs after the DOM update so
  // previewCanvas is bound by the time we draw.
  $effect(() => {
    // Track the reactive deps so Svelte schedules a redraw
    cropToSquare; zoom; panX; panY; imgVersion;
    if (stage === 'edit' && cropToSquare && previewCanvas) {
      // Two RAFs: first to let layout settle (matters on iOS after orientation),
      // second to actually paint
      requestAnimationFrame(() => requestAnimationFrame(redrawPreview));
    }
  });

  function reset() {
    stage = 'pick';
    errorMsg = '';
    progressPct = 0;
    imgSrc = '';
    imgNaturalW = 0;
    imgNaturalH = 0;
    sourceImg = null;
    zoom = 1;
    panX = 0;
    panY = 0;
    cropToSquare = false;
  }

  onDestroy(() => {
    // Free the decoded image — large dataURLs can hold tens of MB
    sourceImg = null;
  });

  function handleFileChange(e) {
    const file = e.currentTarget.files?.[0];
    // Reset the input so picking the same file twice still triggers change
    e.currentTarget.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      errorMsg = 'Please pick an image file (JPEG, PNG, or WebP).';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      errorMsg = 'File is too large. Please pick something under 10 MB.';
      return;
    }
    errorMsg = '';

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result?.toString() ?? '';
      const probe = new Image();
      probe.onload = () => {
        sourceImg = probe;
        imgSrc = dataUrl;
        imgNaturalW = probe.naturalWidth;
        imgNaturalH = probe.naturalHeight;
        // Reset crop state for the new image
        zoom = 1;
        panX = 0;
        panY = 0;
        imgVersion += 1;
        stage = 'edit';
      };
      probe.onerror = () => {
        errorMsg = 'Could not decode that image.';
      };
      probe.src = dataUrl;
    };
    reader.onerror = () => {
      errorMsg = 'Could not read that file.';
    };
    reader.readAsDataURL(file);
  }

  // ── Drag handling on the canvas ────────────────────────────
  function getPoint(e) {
    return e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
  }

  function onPointerDown(e) {
    if (!cropToSquare) return;
    // Prevent iOS rubber-band scroll during the gesture
    e.preventDefault();
    dragging = true;
    const p = getPoint(e);
    dragStartClientX = p.clientX;
    dragStartClientY = p.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const p = getPoint(e);
    const dx = p.clientX - dragStartClientX;
    const dy = p.clientY - dragStartClientY;
    // Pan deltas are in CSS px of the preview canvas; convert to fraction
    // of total pan range. CROP_PREVIEW_PX is the visible square.
    panX = clamp(dragStartPanX - dx / (CROP_PREVIEW_PX / 2), -1, 1);
    panY = clamp(dragStartPanY - dy / (CROP_PREVIEW_PX / 2), -1, 1);
  }

  function onPointerUp() {
    dragging = false;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  // ── Final render to canvas + upload ────────────────────────
  async function uploadImage() {
    errorMsg = '';
    stage = 'uploading';
    progressPct = 5;
    try {
      const canvas = document.createElement('canvas');

      let targetW, targetH;
      if (cropToSquare) {
        // Re-use the same crop math we use for the preview, render at full res
        const { sx, sy, sSize } = computeSourceRect();
        const outSize = Math.min(MAX_DIMENSION, Math.round(sSize));
        canvas.width = outSize;
        canvas.height = outSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unsupported in this browser.');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceImg, sx, sy, sSize, sSize, 0, 0, outSize, outSize);
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

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
          'image/webp',
          TARGET_QUALITY
        );
      });

      progressPct = 45;

      const tmpId = recordId ?? `tmp-${Date.now().toString(36)}`;
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `${userId}/${tmpId}-${rand}.webp`;

      const { error: upErr } = await supabase.storage
        .from('covers')
        .upload(path, blob, {
          contentType: 'image/webp',
          upsert: false,
          cacheControl: '604800'
        });
      if (upErr) throw upErr;

      progressPct = 90;

      const { data } = supabase.storage.from('covers').getPublicUrl(path);
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
</script>

<div class="cover-upload">
  {#if stage === 'pick'}
    <label class="picker">
      <input type="file" accept={ACCEPT_TYPES} onchange={handleFileChange} />
      <div class="picker-cta">
        <span class="picker-icon">🖼️</span>
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
        <span class="toggle-hint">{cropToSquare ? 'Drag inside the frame to position, zoom with the slider' : 'Preserves the original aspect ratio'}</span>
      </label>

      {#if cropToSquare}
        <div class="cropper-wrap">
          <canvas
            bind:this={previewCanvas}
            class="cropper-canvas"
            onmousedown={onPointerDown}
            onmousemove={onPointerMove}
            onmouseup={onPointerUp}
            onmouseleave={onPointerUp}
            ontouchstart={onPointerDown}
            ontouchmove={onPointerMove}
            ontouchend={onPointerUp}
            ontouchcancel={onPointerUp}
            aria-label="Cover image cropper. Drag to pan, use the slider to zoom."
          ></canvas>
        </div>
        <div class="zoom-row">
          <span class="zoom-label">Zoom</span>
          <input type="range" min="1" max="3" step="0.05" bind:value={zoom} />
        </div>
      {:else}
        <div class="preview-frame">
          <img bind:this={previewImg} src={imgSrc} alt="Preview" class="preview-img" />
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
  .picker { display: block; cursor: pointer; }
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
  .picker:hover .picker-cta { border-color: var(--accent); }
  .picker-icon { font-size: 26px; }
  .picker-title { font-family: var(--ff-display); font-size: 15px; color: var(--ink); }
  .picker-hint {
    font-family: var(--ff-display); font-style: italic;
    font-size: 12px; color: var(--ink-3);
  }

  /* ── Edit stage ──────────────────────────────── */
  .edit-stage {
    display: flex; flex-direction: column; gap: 14px;
  }

  .toggle {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer;
    font-family: var(--ff-display); font-size: 14px;
    color: var(--ink); flex-wrap: wrap;
  }
  .toggle input { accent-color: var(--accent); }
  .toggle-hint {
    font-family: var(--ff-display); font-style: italic;
    font-size: 12px; color: var(--ink-3);
    width: 100%; margin-left: 22px;
  }

  /* Square cropper — canvas-based, robust on iOS */
  .cropper-wrap {
    display: flex; justify-content: center;
  }
  .cropper-canvas {
    width: 300px; height: 300px;
    max-width: 100%;
    background: var(--bg-3);
    border-radius: var(--radius);
    cursor: grab;
    user-select: none;
    touch-action: none;  /* prevent page-scroll while panning */
    display: block;
  }
  .cropper-canvas:active { cursor: grabbing; }

  .zoom-row {
    display: flex; align-items: center; gap: 12px;
    max-width: 300px; margin: 0 auto; width: 100%;
  }
  .zoom-label {
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ink-3); flex-shrink: 0;
  }
  .zoom-row input[type='range'] {
    flex: 1; accent-color: var(--accent);
  }

  /* Original-ratio preview */
  .preview-frame {
    display: flex; justify-content: center;
    max-height: 320px;
  }
  .preview-img {
    max-width: 100%; max-height: 320px;
    border-radius: var(--radius);
    border: 1px solid var(--groove);
  }

  /* Uploading state */
  .uploading { padding: 24px; text-align: center; }
  .upload-msg {
    font-family: var(--ff-display); font-style: italic;
    font-size: 14px; color: var(--ink-2);
    margin-bottom: 12px;
  }
  .progress-track {
    width: 100%; height: 4px;
    background: var(--bg-3);
    border-radius: 99px; overflow: hidden;
  }
  .progress-fill {
    height: 100%; background: var(--accent);
    transition: width 0.2s ease;
  }

  /* Error + buttons */
  .error {
    padding: 9px 12px;
    background: rgba(198, 74, 74, 0.12);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: var(--radius);
    font-size: 13px;
  }

  .actions {
    display: flex; justify-content: flex-end; gap: 8px;
  }

  .btn {
    padding: 9px 16px;
    border-radius: var(--radius);
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.14em; text-transform: uppercase;
    border: 1px solid transparent;
    cursor: pointer;
    transition: background var(--t), border-color var(--t), color var(--t);
  }
  .btn.primary { background: var(--accent); color: var(--bg); }
  .btn.primary:hover { background: var(--ink); }
  .btn.ghost {
    background: transparent; color: var(--ink-2);
    border-color: var(--groove);
  }
  .btn.ghost:hover { color: var(--ink); border-color: var(--ink-3); }
</style>
