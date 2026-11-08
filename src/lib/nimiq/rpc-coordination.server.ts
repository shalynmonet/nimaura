import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { RpcCoordination } from './rpc.server';

// Durable coordination is shared by all collectors and worker instances.
// No secret material is used in keys or persisted response payloads.
export function rpcCoordination(db: SupabaseClient<Database>): RpcCoordination {
  return {
    async read(key) {
      const r = await db.from('nimiq_rpc_coordination').select('payload,expires_at').eq('key', key).maybeSingle();
      if (r.error) throw new Error('RPC coordination unavailable.');
      return r.data?.expires_at && Date.parse(r.data.expires_at) > Date.now() ? r.data.payload : undefined;
    },
    async claim(key) {
      const r = await db.rpc('claim_nimiq_rpc_cache', { _key: key });
      if (r.error) throw new Error('RPC coordination unavailable.');
      return r.data;
    },
    async reserve(key, cost) {
      const r = await db.rpc('reserve_nimiq_rpc_slot', { _key: key, _cost: cost });
      if (r.error || !r.data) throw new Error('RPC budget unavailable.');
      return Date.parse(r.data);
    },
    async write(key, token, payload, ttlMs) {
      const r = await db.from('nimiq_rpc_coordination').update({ payload: payload as Database['public']['Tables']['nimiq_rpc_coordination']['Row']['payload'], expires_at: new Date(Date.now() + ttlMs).toISOString(), lease_until: null, lease_token: null }).eq('key', key).eq('lease_token', token);
      if (r.error) throw new Error('RPC cache unavailable.');
    },
    async defer(key, until) {
      // Extend the common pacing gate; never shorten a concurrently reserved slot.
      const r = await db.rpc('defer_nimiq_rpc', { _key: key, _until: new Date(until).toISOString() });
      if (r.error) throw new Error('RPC retry coordination unavailable.');
    },
  };
}