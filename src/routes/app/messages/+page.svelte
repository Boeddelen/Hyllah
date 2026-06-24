<script>
  let { data } = $props();
  const conversations = $derived(data.conversations ?? []);

  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function displayName(partner) {
    return partner.display_name || partner.username || 'Unknown';
  }

  function initials(partner) {
    return displayName(partner).charAt(0).toUpperCase();
  }
</script>

<svelte:head>
  <title>Messages · Hyllah</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <div class="eyebrow">Social</div>
      <h1>Messages</h1>
    </div>
  </header>

  {#if conversations.length === 0}
    <div class="empty-state">
      <svg class="empty-svg" viewBox="0 0 56 56" fill="none" stroke="currentColor"
           stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 10 C8 8 10 6 12 6 L44 6 C46 6 48 8 48 10 L48 34 C48 36 46 38 44 38 L20 38 L10 48 L10 38 L12 38 C10 38 8 36 8 34 Z" />
      </svg>
      <p>No messages yet. Visit a friend's profile to start a conversation.</p>
    </div>
  {:else}
    <ul class="conversation-list">
      {#each conversations as { partner, latestMessage, unreadCount } (partner.id)}
        <li>
          <a href="/app/messages/{partner.id}" class="conversation-row" class:unread={unreadCount > 0}>
            <div class="avatar">
              {#if partner.avatar_url}
                <img src={partner.avatar_url} alt={displayName(partner)} />
              {:else}
                <div class="avatar-initials">{initials(partner)}</div>
              {/if}
            </div>
            <div class="conversation-body">
              <div class="conversation-top">
                <span class="partner-name">{displayName(partner)}</span>
                <span class="timestamp">{timeAgo(latestMessage.created_at)}</span>
              </div>
              <div class="conversation-preview">
                {#if latestMessage.sender_id !== partner.id}
                  <span class="you-prefix">You: </span>
                {/if}
                <span class="preview-text">{latestMessage.body}</span>
              </div>
            </div>
            {#if unreadCount > 0}
              <div class="unread-badge" aria-label="{unreadCount} unread">{unreadCount}</div>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page { padding: 40px 40px 60px; max-width: 680px; }

  .page-header { margin-bottom: 32px; }
  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: clamp(28px, 4vw, 44px);
    font-weight: 400;
    line-height: 1;
    margin: 0;
    color: var(--ink);
  }

  .conversation-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .conversation-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: var(--radius-lg);
    border: 1px solid transparent;
    text-decoration: none;
    color: inherit;
    transition: background var(--t), border-color var(--t);
  }
  .conversation-row:hover {
    background: var(--bg-2);
    border-color: var(--groove);
  }
  .conversation-row.unread { background: var(--bg-2); }

  .avatar {
    width: 44px; height: 44px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--bg-3);
    display: flex; align-items: center; justify-content: center;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-initials {
    font-family: var(--ff-display);
    font-size: 18px;
    font-weight: 500;
    color: var(--ink-2);
  }

  .conversation-body { flex: 1; min-width: 0; }
  .conversation-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }
  .partner-name {
    font-family: var(--ff-display);
    font-size: 15px;
    font-weight: 500;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conversation-row.unread .partner-name { font-weight: 600; }
  .timestamp {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .conversation-preview {
    font-family: var(--ff-display);
    font-size: 13px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conversation-row.unread .conversation-preview { color: var(--ink-2); }
  .you-prefix {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-3);
    margin-right: 2px;
  }

  .unread-badge {
    flex-shrink: 0;
    min-width: 20px; height: 20px;
    padding: 0 5px;
    background: var(--accent);
    color: var(--bg);
    border-radius: 99px;
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }

  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: var(--ink-3);
  }
  .empty-svg { width: 56px; height: 56px; margin: 0 auto 20px; opacity: 0.4; display: block; }
  .empty-state p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    max-width: 340px;
    margin: 0 auto;
  }

  @media (max-width: 640px) {
    .page { padding: 24px 16px 60px; }
  }
</style>
