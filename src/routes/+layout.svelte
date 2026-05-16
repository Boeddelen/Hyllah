<script>
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { PUBLIC_UMAMI_WEBSITE_ID } from '$env/static/public';
  import '../app.css';

  let { data, children } = $props();
  let { session, supabase } = $derived(data);

  // Sync auth state across tabs — when user logs in/out elsewhere, re-fetch
  onMount(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.expires_at !== session?.expires_at) {
        invalidate('supabase:auth');
      }
    });
    return () => listener.subscription.unsubscribe();
  });
</script>

<svelte:head>
  {#if PUBLIC_UMAMI_WEBSITE_ID}
    <!-- Umami analytics — privacy-first, no cookies, GDPR-friendly -->
    <script
      defer
      src="https://cloud.umami.is/script.js"
      data-website-id={PUBLIC_UMAMI_WEBSITE_ID}
    ></script>
  {/if}
</svelte:head>

{@render children()}
