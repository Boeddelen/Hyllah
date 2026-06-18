import { fail, redirect } from '@sveltejs/kit';

/** @type {import('./$types').Actions} */
export const actions = {
  create: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const icon = String(form.get('icon') ?? '💿').trim();
    const description = String(form.get('description') ?? '').trim();
    const isPublic = String(form.get('isPublic') ?? '') === 'true';

    if (!name || name.length > 60) {
      return fail(400, { action: 'create', error: 'Name must be 1–60 characters' });
    }

    // Pick highest sort_order + 1
    const { data: existing } = await supabase
      .from('collections')
      .select('sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data, error } = await supabase
      .from('collections')
      .insert({
        user_id: user.id,
        name,
        icon,
        description: description || null,
        is_public: isPublic,
        sort_order: nextOrder
      })
      .select()
      .single();

    if (error) {
      return fail(500, { action: 'create', error: error.message });
    }

    return { action: 'create', success: true, collection: data };
  },

  update: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const name = String(form.get('name') ?? '').trim();
    const icon = String(form.get('icon') ?? '💿').trim();
    const description = String(form.get('description') ?? '').trim();

    if (!id) return fail(400, { action: 'update', error: 'Missing id' });
    if (!name || name.length > 60) {
      return fail(400, { action: 'update', error: 'Name must be 1–60 characters' });
    }

    const { error } = await supabase
      .from('collections')
      .update({ name, icon, description: description || null })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return fail(500, { action: 'update', error: error.message });
    return { action: 'update', success: true };
  },

  // Flip a collection's public visibility. This is the only path that sets
  // collections.is_public. Two-lock still applies: a collection appears on the
  // public profile only when this is true AND the owner's profile is public.
  toggleVisibility: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    const isPublic = String(form.get('isPublic') ?? '') === 'true';
    if (!id) return fail(400, { action: 'toggleVisibility', error: 'Missing id' });

    // Scoped to the owner — a user can only change their own collections.
    const { error } = await supabase
      .from('collections')
      .update({ is_public: isPublic })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return fail(500, { action: 'toggleVisibility', error: error.message });
    return { action: 'toggleVisibility', success: true };
  },

  delete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { action: 'delete', error: 'Missing id' });

    // Don't allow deleting the last collection
    const { count } = await supabase
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if ((count ?? 0) <= 1) {
      return fail(400, { action: 'delete', error: 'You need at least one collection.' });
    }

    // Cascade will remove records, tracks, custom_fields automatically.
    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return fail(500, { action: 'delete', error: error.message });
    return { action: 'delete', success: true };
  }
};
