// Ping quotidien Supabase pour empêcher la mise en pause (plan gratuit = pause après 7 jours d'inactivité)
const SUPA_URL = 'https://qygjxmgfmfnquxvszzqy.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Z2p4bWdmbWZucXV4dnN6enF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjIwMjIsImV4cCI6MjEwMTIzODAyMn0.BKg5Ty-SfAeNw5LJDsNeXdeB7B_rWXmRl6l7ksH28Ow';

export default async () => {
  const t0 = Date.now();
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/membres?select=id&limit=1`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    const ms = Date.now() - t0;
    console.log(`[keep-alive] ${new Date().toISOString()} — Supabase HTTP ${r.status} (${ms} ms)`);
    return new Response(JSON.stringify({ ok: r.ok, status: r.status, ms }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[keep-alive] échec :', e.message);
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};

// Tous les jours à 06:00 UTC (07:00 à Maroua)
export const config = { schedule: '0 6 * * *' };
