import { fail, redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ parent }) => {
  const { collections } = await parent();
  // If user already has collections, skip setup
  if (collections.length > 0) {
    throw redirect(303, `/app/c/${collections[0].id}`);
  }
  return {};
};

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const icon = String(form.get('icon') ?? '💿').trim();

    if (!name || name.length > 60) {
      return fail(400, { error: 'Name must be 1–60 characters', name, icon });
    }

    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: user.id, name, icon, sort_order: 0 })
      .select()
      .single();

    if (error) {
      return fail(500, { error: error.message, name, icon });
    }

    throw redirect(303, `/app/c/${data.id}`);
  }
};
