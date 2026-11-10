// One shared ~60s timeline: captions, narration and entity visual cues all read the same step.
export type Path = "become" | "release" | "receive" | "remember";
export type Cue = "settle" | "in" | "out" | Path | "return";
export type Step = { text: string; cue: Cue; ms: number };

const PATH_LINES: Record<Path, [string, string]> = {
  become: ["As you breathe in, the Seraph's wings unfold and rise. Let something in you rise with them.", "Picture one small step toward who you are becoming."],
  release: ["As you breathe out, the threads loosen and drift outward. Let one weight drift with them.", "Notice what you no longer need to carry today."],
  receive: ["As you breathe in, the wings open and light gathers toward the entity's eye. Let yourself receive.", "Notice one thing, however small, that is arriving for you."],
  remember: ["As the pattern reconnects, thread to thread, let a memory return to you.", "Hold it gently. You do not have to do anything with it."],
};

export function meditationTimeline(path: Path): Step[] {
  const [a, b] = PATH_LINES[path];
  return [
    { text: "Find a comfortable position. Keep your eyes open, or soften your gaze if you prefer.", cue: "settle", ms: 7000 },
    { text: "Breathe in slowly. The wings gently expand.", cue: "in", ms: 6000 },
    { text: "Breathe out. The forms settle and the light softens.", cue: "out", ms: 6000 },
    { text: a, cue: path, ms: 9000 },
    { text: "Breathe out at your own pace.", cue: "out", ms: 6000 },
    { text: b, cue: path, ms: 9000 },
    { text: "Breathe in. The wings expand once more.", cue: "in", ms: 6000 },
    { text: "Breathe out. Let your breath return to its natural rhythm.", cue: "out", ms: 6000 },
    { text: "The Seraph returns to its own motion. Carry this moment with you.", cue: "return", ms: 6000 },
  ];
}

export const totalMs = (steps: Step[]) => steps.reduce((t, s) => t + s.ms, 0);

/** Which step is active at elapsed ms; returns steps.length when complete. */
export function stepAt(steps: Step[], elapsed: number) {
  let t = 0;
  for (let i = 0; i < steps.length; i++) { t += steps[i]!.ms; if (elapsed < t) return i; }
  return steps.length;
}

/** CSS for the actual artwork per cue; reduced motion uses light only. */
export function cueStyle(cue: Cue | null, reduced: boolean): { transform: string; filter: string } {
  const light = { settle: 1, in: 1.12, out: 0.9, become: 1.15, release: 0.95, receive: 1.1, remember: 1.05, return: 1 } as const;
  const move = { settle: "scale(1)", in: "scale(1.06)", out: "scale(0.98)", become: "translateY(-4%) scale(1.05)", release: "scale(1.02) rotate(-1.5deg)", receive: "scale(1.04)", remember: "rotate(2deg) scale(1.01)", return: "scale(1)" } as const;
  if (!cue) return { transform: "none", filter: "none" };
  return { transform: reduced ? "none" : move[cue], filter: `brightness(${light[cue]})` };
}
