import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CollectiveMilestone = {
  ordinal: number;
  threshold: number;
  unlocked_at: string | null;
  veiled_hint: string;
  name: string | null;
  designation: string | null;
  symbolism: string | null;
  reflection: string | null;
};
export type CollectiveState = { total: number; milestones: CollectiveMilestone[] };

/** Progress toward the next locked milestone; thresholds are cumulative. */
export function collectiveProgress(state: CollectiveState) {
  const next = state.milestones.find((m) => !m.unlocked_at && m.threshold > state.total) ?? null;
  const prev = [...state.milestones].reverse().find((m) => m.threshold <= state.total)?.threshold ?? 0;
  const span = next ? next.threshold - prev : 1;
  return {
    next,
    remaining: next ? next.threshold - state.total : 0,
    fraction: next ? Math.min(1, (state.total - prev) / span) : 1,
  };
}

export const collectiveQuery = () =>
  queryOptions({
    queryKey: ["collective", "nimiq"],
    queryFn: async (): Promise<CollectiveState> => {
      const { data, error } = await supabase.rpc("collective_state", { _deployment: "nimiq" });
      if (error) throw error;
      return data as unknown as CollectiveState;
    },
    staleTime: 30_000,
  });
