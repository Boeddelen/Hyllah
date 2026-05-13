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
