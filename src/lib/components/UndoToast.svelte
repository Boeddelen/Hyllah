<script>
  /**
   * UndoToast — slides up from bottom-right, counts down, then either calls
   * onExpire() (commit the action) or onUndo() (user clicked Undo).
   *
   * Props:
   *  - message: string — text shown ("Deleted Nirvana – Nevermind")
   *  - duration: number — seconds to wait before expire (default 8)
   *  - onUndo: () => void
   *  - onExpire: () => void
   */
  let { message, duration = 8, onUndo, onExpire } = $props();

  let remaining = $state(duration);
  let active = $state(true);
  let intervalId;
  let timeoutId;

  function start() {
    remaining = duration;
    active = true;
    const startedAt = Date.now();

    // Update countdown 10x/sec for smooth progress bar
    intervalId = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      remaining = Math.max(0, duration - elapsed);
    }, 100);

    timeoutId = setTimeout(() => {
      if (active) {
        active = false;
        clearInterval(intervalId);
        onExpire?.();
      }
    }, duration * 1000);
  }

  function handleUndo() {
    if (!active) return;
    active = false;
    clearInterval(intervalId);
    clearTimeout(timeoutId);
    onUndo?.();
  }

  $effect(() => {
    start();
    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  });

  let progressPct = $derived(Math.max(0, (remaining / duration) * 100));
</script>

{#if active}
  <div class="toast" role="status" aria-live="polite">
    <div class="content">
      <span class="message">{message}</span>
      <button class="undo-btn" onclick={handleUndo}>Undo</button>
    </div>
    <div class="progress" style:width="{progressPct}%"></div>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 200;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    min-width: 320px;
    max-width: 420px;
    box-shadow: 0 12px 40px var(--shadow);
    overflow: hidden;
    animation: slideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes slideIn {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
  }

  .message {
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .undo-btn {
    flex-shrink: 0;
    padding: 6px 14px;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background var(--t), color var(--t);
  }

  .undo-btn:hover {
    background: var(--accent);
    color: var(--bg);
  }

  .progress {
    height: 2px;
    background: var(--accent);
    transition: width 0.1s linear;
  }

  @media (max-width: 640px) {
    .toast {
      bottom: 16px;
      right: 16px;
      left: 16px;
      max-width: none;
      min-width: 0;
    }
  }
</style>
