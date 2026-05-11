<script>
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
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

{@render children()}
