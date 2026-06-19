<script>
  import { onMount } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { browser } from '$app/environment';

  let { data, children } = $props();

  // Apply the profile owner's chosen public theme to the whole document.
  function applyPublicTheme(theme, mode) {
    if (!browser) return;
    const el = document.documentElement;
    el.setAttribute('data-theme', theme ?? 'listening-room');
    el.setAttribute('data-mode', mode === 'light' ? 'light' : 'dark');
  }

  // Restore the visitor's OWN saved theme (the source of truth in localStorage),
  // falling back to app defaults so a profile's theme never lingers after you
  // leave it.
  function restoreVisitorTheme() {
    if (!browser) return;
    const el = document.documentElement;
    let storedTheme = null;
    let storedMode = null;
    try {
      storedTheme = localStorage.getItem('rv-theme-id');
      storedMode = localStorage.getItem('rv-mode');
    } catch { /* storage disabled */ }
    el.setAttribute('data-theme', storedTheme || 'listening-room');
    el.setAttribute('data-mode', storedMode === 'light' ? 'light' : 'dark');
  }

  // Apply on mount and re-apply whenever the owner (and thus the theme) changes,
  // e.g. navigating directly from one public profile to another. Navigating
  // between a single owner's own pages keeps the same theme applied.
  $effect(() => {
    applyPublicTheme(data.publicTheme, data.publicMode);
  });

  // Only restore the visitor's theme when actually leaving the public section.
  // Navigations that stay under /u/ keep the owner's theme (the $effect above
  // re-applies it for the destination).
  beforeNavigate((nav) => {
    if (!browser) return;
    const dest = nav.to?.url?.pathname ?? '';
    if (!dest.startsWith('/u/')) restoreVisitorTheme();
  });

  // Backstop: if this layout unmounts (client-side navigation out of /u/),
  // make sure the visitor's theme is restored.
  onMount(() => {
    return () => restoreVisitorTheme();
  });
</script>

{@render children()}
