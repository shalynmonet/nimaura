import { mulberry32, type Intention } from "./manifest";

/** Experimental snapshot only. Never used by fulfillment or CURRENT_RENDERER_VERSION. */
export function buildSeraphStudy(seed: number, intention: Intention) {
  const random = mulberry32(seed);
  return {
    rendererVersion: 3 as const,
    seed,
    intention,
    wings: Array.from({ length: 6 }, (_, i) => ({
      angle: i * Math.PI / 3 + Math.PI / 6,
      length: 1.32 + random() * .22,
      width: .28 + random() * .08,
      curl: .52 + random() * .24,
      phase: random() * Math.PI * 2,
      depth: i % 2 ? .22 : -.22,
    })),
    weaveRepeat: 7 + random() * 2,
    irisSeed: Math.floor(random() * 100000),
    rhythm: intention === "remember" ? .48 : intention === "release" ? .62 : intention === "become" ? .7 : .55,
  };
}

export type StudyConfig = ReturnType<typeof buildSeraphStudy>;
export type StudyPlayback = { time: number; speed: number; x: number; y: number; ripple: number; boost: number; heldFor: number };
export const initialPlayback = (): StudyPlayback => ({ time: 0, speed: 1, x: 0, y: 0, ripple: 0, boost: 1, heldFor: 0 });
export function advanceStudy(state: StudyPlayback, delta: number, input: { held: boolean; x: number; y: number; reduced: boolean }) {
  const dt = Math.min(Math.max(delta, 0), .05);
  const blend = 1 - Math.exp(-dt * 4);
  // Taps raise the tempo up to 5x; a deliberate hold (not a tap's brief press) slows it and resets the boost.
  state.heldFor = input.held ? state.heldFor + dt : 0;
  const holding = state.heldFor > .25;
  if (holding) state.boost = 1;
  const targetSpeed = input.reduced ? .12 : holding ? .16 : state.boost;
  state.speed += (targetSpeed - state.speed) * blend;
  state.time += dt * state.speed;
  state.x += (Math.max(-1, Math.min(1, input.x)) - state.x) * blend;
  state.y += (Math.max(-1, Math.min(1, input.y)) - state.y) * blend;
  state.ripple = Math.max(0, state.ripple - dt * .7);
  return state;
}