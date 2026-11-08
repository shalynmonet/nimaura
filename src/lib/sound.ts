// Ambient drone via WebAudio. Pitch is derived from the manifestation seed.
let ctx: AudioContext | null = null;
let nodes: { stop: () => void } | null = null;

export function startDrone(seed: number) {
  stopDrone();
  ctx = ctx ?? new AudioContext();
  const c = ctx;
  const base = 55 * Math.pow(2, (seed % 7) / 12);
  const master = c.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.16, c.currentTime + 3);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  filter.connect(master).connect(c.destination);
  const oscs = [1, 1.5, 2.003, 3.01].map((m, i) => {
    const o = c.createOscillator();
    o.type = i === 0 ? "sine" : "triangle";
    o.frequency.value = base * m;
    const g = c.createGain();
    g.gain.value = 0.5 / (i + 1);
    o.connect(g).connect(filter);
    o.start();
    return o;
  });
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  nodes = {
    stop: () => {
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.linearRampToValueAtTime(0, c.currentTime + 1);
      setTimeout(() => [...oscs, lfo].forEach((o) => o.stop()), 1100);
    },
  };
}

export function stopDrone() {
  nodes?.stop();
  nodes = null;
}
