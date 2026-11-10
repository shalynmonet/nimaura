// Path-specific ambient soundscapes via WebAudio. Started only from a user tap; conservative levels.
import type { Path } from "./meditation";
let ctx: AudioContext | null = null;
let current: { stop: () => void; master: GainNode } | null = null;
let level = 0.12, ducked = false;

const target = () => (ducked ? level * 0.35 : level);
function onVisibility() { if (!ctx) return; if (document.hidden) void ctx.suspend(); else if (current) void ctx.resume(); }

export function startAmbient(seed: number, path: Path) {
  stopAmbient();
  ctx = ctx ?? new AudioContext();
  const c = ctx; void c.resume();
  document.addEventListener("visibilitychange", onVisibility);
  const now = c.currentTime;
  const master = c.createGain(); master.gain.setValueAtTime(0, now); master.gain.linearRampToValueAtTime(target(), now + 3);
  const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.connect(master).connect(c.destination);
  const nudge = Math.pow(2, (seed % 5) / 24); // small seeded variation, never a jump
  const voices: OscillatorNode[] = [];
  const voice = (freq: number, gain: number, type: OscillatorType = "sine") => {
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq * nudge, now); g.gain.value = gain;
    o.connect(g).connect(filter); o.start(); voices.push(o); return { o, g };
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  if (path === "become") { // slow rising glide and brightening harmonics
    filter.frequency.setValueAtTime(600, now); filter.frequency.linearRampToValueAtTime(2200, now + 40);
    for (const [m, g] of [[1, 0.4], [1.5, 0.2], [2, 0.12], [3, 0.06]] as const) {
      const { o } = voice(196 * m, g, m === 1 ? "sine" : "triangle"); o.frequency.linearRampToValueAtTime(196 * m * nudge * 1.335, now + 40);
    }
  } else if (path === "release") { // descending glide, texture thins out
    filter.frequency.setValueAtTime(1600, now); filter.frequency.linearRampToValueAtTime(400, now + 40);
    for (const [m, g] of [[1, 0.4], [1.25, 0.18], [2, 0.14], [2.5, 0.08]] as const) {
      const { o, g: gn } = voice(262 * m, g, "triangle"); o.frequency.linearRampToValueAtTime(262 * m * nudge * 0.75, now + 40);
      if (m > 1) gn.gain.linearRampToValueAtTime(0.0001, now + 20 + m * 6);
    }
  } else if (path === "receive") { // warm sustained midrange with soft layers
    filter.frequency.setValueAtTime(1100, now);
    for (const [f, g] of [[220, 0.35], [277.2, 0.2], [329.6, 0.18], [440, 0.06]] as const) voice(f, g);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.05; lfo.connect(lg).connect(master.gain); lfo.start(); voices.push(lfo);
  } else { // remember: low drone plus a recurring four-note motif
    filter.frequency.setValueAtTime(900, now);
    voice(110, 0.35); voice(165, 0.15);
    const motif = [220, 261.6, 246.9, 196];
    const play = () => {
      const t0 = c.currentTime;
      motif.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = f * nudge;
        g.gain.setValueAtTime(0, t0 + i * 0.9); g.gain.linearRampToValueAtTime(0.16, t0 + i * 0.9 + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.9 + 1.6);
        o.connect(g).connect(filter); o.start(t0 + i * 0.9); o.stop(t0 + i * 0.9 + 1.7);
      });
    };
    play(); timer = setInterval(play, 9000);
  }
  current = { master, stop: () => {
    if (timer) clearInterval(timer);
    master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(master.gain.value, c.currentTime); master.gain.linearRampToValueAtTime(0, c.currentTime + 1);
    setTimeout(() => voices.forEach((o) => { try { o.stop(); } catch { /* already stopped */ } }), 1100);
  } };
}

export function stopAmbient() {
  current?.stop(); current = null;
  document.removeEventListener("visibilitychange", onVisibility);
}
function ramp() { if (ctx && current) current.master.gain.linearRampToValueAtTime(target(), ctx.currentTime + 0.8); }
/** Lower ambient under narration so speech stays intelligible. */
export function duckAmbient(on: boolean) { ducked = on; ramp(); }
export function setAmbientVolume(v: number) { level = Math.max(0, Math.min(0.2, v)); ramp(); }
