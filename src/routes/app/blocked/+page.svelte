<script>
  import { enhance } from '$app/forms';

  let { data } = $props();
  const blocked = $derived(data.blocked ?? []);

  let busyId = $state(null);

  function displayName(u) {
    return u?.display_name || u?.username || 'Unknown';
  }
  function initials(u) {
    return displayName(u).charAt(0).toUpperCase();
  }
  function blockedSince(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<svelte:head>
  <title>Blocked users · Hyllah</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <div class="eyebrow">Privacy</div>
      <h1>Blocked users</h1>
      <p class="sub">
        Blocked users can't see your profile, send you friend requests, or message you.
        You also won't see them anywhere on Hyllah.
      </p>
    </div>
  </header>

  {#if blocked.length === 0}
    <div class="empty-state">
      <p>You haven't blocked anyone.</p>
    </div>
  {:else}
    <ul class="people-list">
      {#each blocked as { user, blockedAt } (user.id)}
        <li class="person-row">
          <div class="person-info">
            <div class="avatar">
              {#if user.avatar_url}
                <img src={user.avatar_url} alt="" />
              {:else}
                <div class="avatar-placeholder">{initials(user)}</div>
              {/if}
            </div>
            <div class="person-meta">
              <div class="person-name">{displayName(user)}</div>
              <div class="person-sub">@{user.username} · blocked {blockedSince(blockedAt)}</div>
            </div>
          </div>
          <form
            method="POST"
            action="?/unblock"
            use:enhance={() => {
              busyId = user.id;
              return async ({ update }) => {
                await update();
                busyId = null;
              };
            }}
          >
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" class="btn ghost sm" disabled={busyId === user.id}>
              {busyId === user.id ? 'Unblocking…' : 'Unblock'}
            </button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page { padding: 40px 40px 60px; max-width: 680px; margin: 0 auto; }

  .page-header { margin-bottom: 32px; }
  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 8px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: clamp(28px, 4vw, 44px); font-weight: 400; line-height: 1;
    margin: 0 0 12px; color: var(--ink);
  }
  .sub {
    font-family: var(--ff-display);
    font-size: 14px; line-height: 1.5; color: var(--ink-3);
    max-width: 480px; margin: 0;
  }

  .people-list { list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .person-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 12px 14px;
    border: 1px solid var(--groove); border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .person-info { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .avatar {
    width: 40px; height: 40px; border-radius: 50%;
    overflow: hidden; background: var(--bg-3); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .avatar-placeholder {
    font-family: var(--ff-display); font-size: 16px; font-weight: 500; color: var(--ink-2);
  }
  .person-meta { min-width: 0; }
  .person-name {
    font-family: var(--ff-display); font-size: 15px; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .person-sub {
    font-family: var(--ff-mono); font-size: 10px; color: var(--ink-3); margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .btn {
    background: none; border: 1px solid var(--groove); color: var(--ink-2);
    font-family: var(--ff-mono); font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 8px 14px; border-radius: var(--radius);
    cursor: pointer; transition: color var(--t), border-color var(--t), background var(--t);
  }
  .btn.sm { font-size: 11px; padding: 6px 12px; }
  .btn.ghost:hover:not(:disabled) {
    color: var(--ink); border-color: var(--ink-3); background: var(--bg-2);
  }
  .btn:disabled { opacity: 0.5; cursor: default; }

  .empty-state {
    text-align: center; padding: 60px 20px; color: var(--ink-3);
    font-family: var(--ff-display); font-style: italic; font-size: 15px;
  }

  @media (max-width: 640px) { .page { padding: 24px 16px 60px; } }
</style>
