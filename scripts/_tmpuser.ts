import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const db = createAdminClient();
  const email = 'verifybot@fpldash.local';
  if (process.argv[2] === 'create') {
    const { data, error } = await db.auth.admin.createUser({
      email, password: 'verify-bot-temp-9271', email_confirm: true,
      user_metadata: { username: 'verifybot' },
    });
    if (error) throw error;
    const uid = data.user!.id;

    // Full, legal 15-player squad so "Upgrade ideas" (only shown once complete) renders.
    const { data: picks } = await db.from('players')
      .select('id, now_cost, team_id, position').order('now_cost', { ascending: true }).limit(300);
    const chosen: any[] = [];
    const quota: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
    const perClub: Record<number, number> = {};
    for (const p of picks ?? []) {
      if ((quota[p.position] ?? 0) <= 0) continue;
      if ((perClub[p.team_id] ?? 0) >= 3) continue;
      quota[p.position]--; perClub[p.team_id] = (perClub[p.team_id] ?? 0) + 1;
      chosen.push({ user_id: uid, player_id: p.id, purchase_price: p.now_cost, is_captain: false, is_vice_captain: false });
    }
    const ins1 = await db.from('my_team').insert(chosen);
    if (ins1.error) throw new Error('my_team insert failed: ' + JSON.stringify(ins1.error));
    console.log('my_team: created with', chosen.length, 'players (verified)');
  } else {
    const { data } = await db.auth.admin.listUsers();
    const u = data.users.find((x) => x.email === email);
    if (!u) return console.log('none');
    await db.auth.admin.deleteUser(u.id);
    await db.from('squads').delete().eq('user_id', u.id);
    const { count } = await db.from('profiles').select('*', { count: 'exact', head: true });
    console.log('deleted; profiles remaining:', count);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
