-- Table-level UPDATE overrides column-specific restrictions; remove it explicitly.
revoke update on public.profiles from authenticated, anon;
revoke update (credits, reserve_address) on public.profiles from authenticated, anon;
grant update (display_name, savings_goal_nim, sound_enabled) on public.profiles to authenticated;
