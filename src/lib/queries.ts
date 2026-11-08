import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const currentDropQuery = () =>
  queryOptions({
    queryKey: ["drop", "current"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("daily_drops")
        .select("id, number, clue, sigil, starts_at, ends_at")
        .lte("starts_at", now)
        .gt("ends_at", now)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const sessionQuery = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

export const profileQuery = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
