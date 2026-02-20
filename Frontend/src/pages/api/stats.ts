import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../services/supabase';

export const GET: APIRoute = async () => {
  const [walletsRes, developersRes, walletsTimeline] = await Promise.all([
    supabaseAdmin.from('wallets').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('developers').select('*', { count: 'exact', head: true }),
    supabaseAdmin
      .from('wallets')
      .select('created_at')
      .order('created_at', { ascending: true }),
  ]);

  // Group wallets by date as cumulative count
  const timeline: { date: string; count: number }[] = [];
  if (walletsTimeline.data && walletsTimeline.data.length > 0) {
    const byDate = new Map<string, number>();
    for (const w of walletsTimeline.data) {
      const day = w.created_at.slice(0, 10);
      byDate.set(day, (byDate.get(day) ?? 0) + 1);
    }
    let cumulative = 0;
    for (const [date, count] of byDate) {
      cumulative += count;
      timeline.push({ date, count: cumulative });
    }
  }

  return new Response(
    JSON.stringify({
      wallets: walletsRes.count ?? 0,
      integrations: developersRes.count ?? 0,
      timeline,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
};
