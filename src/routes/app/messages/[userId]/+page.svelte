<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  let { data, form } = $props();

  const partner = $derived(data.partner);
  const isFriend = $derived(data.isFriend);
  const myId = $derived(data.currentUserId);

  let messages = $state(data.messages ?? []);
  let content = $state('');
  let sending = $state(false);
  let sendError = $state('');
  let messagesEl;

  // Keep message list in sync when the load function re-runs (e.g. after poll).
  $effect(() => {
    messages = data.messages ?? [];
  });

  // Scroll to the bottom of the message list.
  function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  $effect(() => {
    // Re-scroll when message count changes.
    if (messages.length) {
      // Defer to next microtask so DOM has updated.
      Promise.resolve().then(scrollToBottom);
    }
  });

  // Handle form result.
  $effect(() => {
    if (form?.action === 'send') {
      if (form.success) {
        content = '';
        sendError = '';
      } else if (form.error) {
        sendError = form.error;
      }
    }
  });

  // Poll for new messages every 5 seconds while the tab is visible.
  let pollTimer;
  function startPolling() {
    pollTimer = setInterval(async () => {
      if (browser && document.visibilityState === 'visible') await invalidateAll();
    }, 5000);
  }
  function stopPolling() { clearInterval(pollTimer); }

  onMount(() => {
    scrollToBottom();
    startPolling();
    if (browser) document.addEventListener('visibilitychange', handleVisibility);
  });
  onDestroy(() => {
    stopPolling();
    if (browser) document.removeEventListener('visibilitychange', handleVisibility);
  });
  function handleVisibility() {
    // Refresh immediately when tab becomes visible so the view is current.
    if (document.visibilityState === 'visible') invalidateAll();
  }

  function displayName(u) {
    return u.display_name || u.username || 'Unknown';
  }
  function initials(u) { return displayName(u).charAt(0).toUpperCase(); }

  function formatTime(iso) {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday
      ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function handleKey(e) {
    // Ctrl/Cmd+Enter sends, plain Enter is a newline.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.closest('form')?.requestSubmit();
    }
  }
</script>

<svelte:head>
  <title>{displayName(partner)} · Messages · Hyllah</title>
</svelte:head>

<div class="thread-page">
  <!-- ── Header ────────────────────────────────────────────────── -->
  <header class="thread-header">
    <a href="/app/messages" class="back-btn" aria-label="Back to messages">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 4 L6 10 L12 16" />
      </svg>
    </a>
    <a href="/u/{partner.username}" class="partner-link">
      <div class="partner-avatar">
        {#if partner.avatar_url}
          <img src={partner.avatar_url} alt={displayName(partner)} />
        {:else}
          <div class="partner-initials">{initials(partner)}</div>
        {/if}
      </div>
      <span class="partner-name">{displayName(partner)}</span>
    </a>
  </header>

  <!-- ── Messages ──────────────────────────────────────────────── -->
  <div class="messages-area" bind:this={messagesEl}>
    {#if messages.length === 0}
      <div class="empty-thread">
        <p>No messages yet — say hello!</p>
      </div>
    {:else}
      <ul class="message-list">
        {#each messages as msg (msg.id)}
          <li class="msg" class:mine={msg.sender_id === myId}>
            <div class="msg-bubble">
              <p class="msg-content">{msg.body}</p>
            </div>
            <span class="msg-time">{formatTime(msg.created_at)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- ── Compose ───────────────────────────────────────────────── -->
  <div class="compose-area">
    {#if !isFriend}
      <p class="not-friend-notice">
        You're no longer friends — you can read past messages, but cannot send new ones.
      </p>
    {:else}
      {#if sendError}
        <p class="send-error">{sendError}</p>
      {/if}
      <form
        method="POST"
        action="?/send"
        use:enhance={() => {
          sending = true;
          sendError = '';
          return async ({ update }) => {
            await update();
            sending = false;
          };
        }}
        class="compose-form"
      >
        <textarea
          name="content"
          bind:value={content}
          placeholder="Write a message… (Ctrl+Enter to send)"
          maxlength="2000"
          rows="3"
          class="compose-input"
          disabled={sending}
          onkeydown={handleKey}
        ></textarea>
        <div class="compose-footer">
          <span class="char-count" class:near-limit={content.length > 1800}>
            {content.length}/2000
          </span>
          <button type="submit" class="send-btn" disabled={sending || !content.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .thread-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 0px); /* fill available height */
    max-height: 100vh;
    max-width: 680px;
    margin: 0;
  }

  /* ── Header ─────────────────────────────────────────── */
  .thread-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    border-bottom: 1px solid var(--groove);
    flex-shrink: 0;
  }
  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px; height: 36px;
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    color: var(--ink-2);
    text-decoration: none;
    transition: color var(--t), border-color var(--t), background var(--t);
    flex-shrink: 0;
  }
  .back-btn svg { width: 18px; height: 18px; }
  .back-btn:hover { color: var(--ink); border-color: var(--ink-3); background: var(--bg-2); }

  .partner-link {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: inherit;
  }
  .partner-link:hover .partner-name { color: var(--accent); }
  .partner-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-3);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .partner-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .partner-initials {
    font-family: var(--ff-display);
    font-size: 15px;
    font-weight: 500;
    color: var(--ink-2);
  }
  .partner-name {
    font-family: var(--ff-display);
    font-size: 16px;
    font-weight: 500;
    color: var(--ink);
    transition: color var(--t);
  }

  /* ── Messages ───────────────────────────────────────── */
  .messages-area {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
  }

  .empty-thread {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-3);
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 15px;
  }

  .message-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: auto; /* push to bottom */
  }

  .msg {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 72%;
  }
  .msg.mine {
    align-self: flex-end;
    align-items: flex-end;
  }

  .msg-bubble {
    padding: 10px 14px;
    border-radius: 16px;
    max-width: 100%;
  }
  .msg:not(.mine) .msg-bubble {
    background: var(--surface);
    border: 1px solid var(--groove);
    border-bottom-left-radius: 4px;
  }
  .msg.mine .msg-bubble {
    background: var(--accent);
    border-bottom-right-radius: 4px;
  }

  .msg-content {
    font-family: var(--ff-display);
    font-size: 14px;
    line-height: 1.5;
    color: var(--ink);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg.mine .msg-content { color: var(--bg); }

  .msg-time {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    margin-top: 3px;
    padding: 0 2px;
  }

  /* ── Compose ────────────────────────────────────────── */
  .compose-area {
    flex-shrink: 0;
    border-top: 1px solid var(--groove);
    padding: 16px 24px;
    background: var(--bg);
  }

  .not-friend-notice {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-3);
    text-align: center;
    padding: 8px 0;
  }

  .send-error {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--danger);
    margin-bottom: 8px;
  }

  .compose-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .compose-input {
    width: 100%;
    padding: 10px 14px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    color: var(--ink);
    font-family: var(--ff-display);
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    outline: none;
    transition: border-color var(--t);
  }
  .compose-input:focus { border-color: var(--accent); }
  .compose-input::placeholder { color: var(--ink-3); }
  .compose-input:disabled { opacity: 0.6; }

  .compose-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .char-count {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
  }
  .char-count.near-limit { color: var(--danger); }

  .send-btn {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--bg);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 8px 18px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: filter var(--t);
    white-space: nowrap;
  }
  .send-btn:hover:not(:disabled) { filter: brightness(1.08); }
  .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 640px) {
    .thread-header { padding: 12px 16px; }
    .messages-area { padding: 16px; }
    .compose-area { padding: 12px 16px; }
    .msg { max-width: 85%; }
  }
</style>
