import { redirect, fail } from '@sveltejs/kit';
import { getRequestToken } from '$lib/server/discogs.js';
import { PUBLIC_APP_URL } from '$env/static/public';
import { SUPPORTED_CURRENCIES } from '$lib/currency.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ url }) => {
  return {
    discogsStatus: url.searchParams.get('discogs'),
    discogsDetail: url.searchParams.get('detail'),
    prefsStatus: url.searchParams.get('prefs'),
    profileStatus: url.searchParams.get('profile'),
    profileError: url.searchParams.get('profile_err'),
    pubThemeStatus: url.searchParams.get('pubtheme')
  };
};

// Same reserved list as the username-available endpoint. Kept in sync by hand
// since the two are tiny; a shared module is overkill for ~50 strings.
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'login', 'logout', 'signup',
  'signout', 'register', 'settings', 'account', 'profile', 'u', 'user', 'users',
  'help', 'support', 'contact', 'about', 'pricing', 'home', 'feed', 'dashboard',
  'stats', 'collection', 'collections', 'records', 'record', 'discogs',
  'callback', 'connect', 'disconnect', 'all', 'archive', 'archived', 'tags',
  'terms', 'privacy', 'gdpr', 'legal', 'cookies', 'security', 'abuse',
  'dmca', 'tos', 'eula', 'imprint',
  'www', 'mail', 'email', 'webmail', 'ftp', 'ssh', 'root', 'system',
  'public', 'private', 'official', 'staff', 'team', 'mod', 'moderator',
  'bot', 'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'hyllah', 'retro-vault', 'retro_vault', 'vault', 'anthropic',
  'null', 'undefined', 'anonymous', 'me', 'you'
]);
const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;

/**
 * Actions live on the settings page itself — no cross-route posting.
 * This is the SvelteKit-idiomatic approach and eliminates all routing ambiguity.
 */

/** @type {import('./$types').Actions} */
export const actions = {
  /**
   * Initiate Discogs OAuth.
   * Gets a request token from Discogs, stashes it in a cookie, redirects to Discogs.
   * IMPORTANT: do NOT wrap the final redirect() in try/catch — it throws internally
   * and a catch block will swallow it.
   */
  connectDiscogs: async ({ locals: { safeGetSession }, cookies }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const callbackUrl = `${PUBLIC_APP_URL}/app/discogs/callback`;

    // Get request token — if this fails, redirect to settings with the error
    // message visible so we can diagnose without needing server logs.
    let requestTokenResult;
    try {
      requestTokenResult = await getRequestToken(callbackUrl);
    } catch (err) {
      console.error('Discogs getRequestToken failed:', err);
      throw redirect(
        303,
        `/app/settings?discogs=error&detail=${encodeURIComponent(err.message ?? 'unknown error')}`
      );
    }

    const { token, tokenSecret, authorizeUrl } = requestTokenResult;

    cookies.set(
      'rv_dg_req',
      JSON.stringify({ t: token, s: tokenSecret }),
      {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 15
      }
    );

    // This redirect MUST be outside try/catch — it throws internally
    throw redirect(303, authorizeUrl);
  },

  /** Disconnect Discogs — clears stored tokens from user profile. */
  disconnectDiscogs: async ({ locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    await supabase
      .from('users')
      .update({
        discogs_username: null,
        discogs_oauth_token: null,
        discogs_oauth_token_secret: null,
        discogs_connected_at: null
      })
      .eq('id', user.id);

    throw redirect(303, '/app/settings?discogs=disconnected');
  },

  /** Update display preferences: card_back_view, use_discogs_prices, show_value_source. */
  updatePreferences: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const cardBackView = form.get('card_back_view')?.toString();

    // Whitelist validation — only accept known values
    if (!['details', 'tracklist', 'both'].includes(cardBackView)) {
      throw redirect(303, '/app/settings?prefs=error');
    }

    // Checkboxes: present in formData only when checked. Treat absent as false.
    const useDiscogsPrices = form.get('use_discogs_prices') === 'on';
    const showValueSource = form.get('show_value_source') === 'on';

    const { error } = await supabase
      .from('users')
      .update({
        card_back_view: cardBackView,
        use_discogs_prices: useDiscogsPrices,
        show_value_source: showValueSource
      })
      .eq('id', user.id);

    if (error) {
      console.error('updatePreferences failed:', error);
      throw redirect(303, '/app/settings?prefs=error');
    }
    throw redirect(303, '/app/settings?prefs=saved');
  },

  /**
   * Update profile fields: username, display_name, bio, display_currency,
   * is_public. Validates each field defensively and
   * surfaces user-friendly errors via URL params.
   */
  updateProfile: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const usernameRaw = (form.get('username') ?? '').toString().trim().toLowerCase();
    const displayNameRaw = (form.get('display_name') ?? '').toString().trim();
    const bioRaw = (form.get('bio') ?? '').toString().trim();
    const currencyRaw = (form.get('display_currency') ?? 'EUR').toString().trim().toUpperCase();
    const isPublic = form.get('is_public') === 'on';

    // ── Username validation ────────────────────────────────────────
    let username = null;
    if (usernameRaw) {
      if (!USERNAME_RE.test(usernameRaw)) {
        throw redirect(303, '/app/settings?profile=error&profile_err=' +
          encodeURIComponent('Username must be 3–30 characters: lowercase letters, numbers, dash, underscore.'));
      }
      if (RESERVED_USERNAMES.has(usernameRaw)) {
        throw redirect(303, '/app/settings?profile=error&profile_err=' +
          encodeURIComponent('That username is reserved. Please pick another.'));
      }
      // Uniqueness — case-insensitive
      const { data: collision } = await supabase
        .from('users')
        .select('id')
        .ilike('username', usernameRaw)
        .maybeSingle();
      if (collision && collision.id !== user.id) {
        throw redirect(303, '/app/settings?profile=error&profile_err=' +
          encodeURIComponent('That username is taken.'));
      }
      username = usernameRaw;
    }

    // ── Display name ───────────────────────────────────────────────
    let displayName = null;
    if (displayNameRaw) {
      if (displayNameRaw.length > 60) {
        throw redirect(303, '/app/settings?profile=error&profile_err=' +
          encodeURIComponent('Display name must be 60 characters or fewer.'));
      }
      displayName = displayNameRaw;
    }

    // ── Bio ────────────────────────────────────────────────────────
    let bio = null;
    if (bioRaw) {
      if (bioRaw.length > 500) {
        throw redirect(303, '/app/settings?profile=error&profile_err=' +
          encodeURIComponent('Bio must be 500 characters or fewer.'));
      }
      bio = bioRaw;
    }

    // ── Currency (whitelist) ───────────────────────────────────────
    if (!SUPPORTED_CURRENCIES.includes(currencyRaw)) {
      throw redirect(303, '/app/settings?profile=error&profile_err=' +
        encodeURIComponent('Unsupported currency.'));
    }

    // ── Persist ────────────────────────────────────────────────────
    // is_public requires a username — otherwise the public profile page
    // wouldn't have a URL. Enforce server-side.
    const finalIsPublic = isPublic && Boolean(username);

    const { error: dbErr } = await supabase
      .from('users')
      .update({
        username,
        display_name: displayName,
        bio,
        display_currency: currencyRaw,
        is_public: finalIsPublic
      })
      .eq('id', user.id);

    if (dbErr) {
      console.error('updateProfile failed:', dbErr);
      throw redirect(303, '/app/settings?profile=error&profile_err=' +
        encodeURIComponent('Could not save profile — please try again.'));
    }
    throw redirect(303, '/app/settings?profile=saved');
  },

  /** Update or remove the user's avatar. */
  updateAvatarUrl: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const action = form.get('action')?.toString();

    if (action === 'removeAvatar') {
      // Remove the avatar
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: null })
        .eq('id', user.id);
      if (error) console.error('Remove avatar failed:', error);
      return; // No redirect — async request
    }

    // Set a new avatar URL
    const avatarUrl = form.get('avatarUrl')?.toString();
    if (!avatarUrl) return;

    const { error } = await supabase
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    if (error) console.error('updateAvatarUrl failed:', error);
  },

  /** Update the theme shown on the user's public profile page. */
  updatePublicTheme: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const publicTheme = form.get('public_theme')?.toString() ?? 'listening-room';
    const publicMode  = form.get('public_mode')?.toString()  ?? 'dark';

    const VALID_THEMES = ['listening-room', 'neon-abyss', 'black-frost', 'concrete'];
    const VALID_MODES  = ['dark', 'light'];

    if (!VALID_THEMES.includes(publicTheme) || !VALID_MODES.includes(publicMode)) {
      return fail(400, { action: 'updatePublicTheme', error: 'Invalid theme or mode.' });
    }

    const { error } = await supabase
      .from('users')
      .update({ public_theme: publicTheme, public_mode: publicMode })
      .eq('id', user.id);

    if (error) {
      console.error('updatePublicTheme failed:', error);
      return fail(500, { action: 'updatePublicTheme', error: 'Could not save public theme.' });
    }
    throw redirect(303, '/app/settings?pubtheme=saved');
  }
};
