import { useEffect, useRef, useState } from "react";
import { meditationTimeline, stepAt, totalMs, type Cue, type Path } from "@/lib/meditation";
import { duckAmbient, setAmbientVolume } from "@/lib/sound";

type Mode = "audio" | "captions";
const btn = "rounded-sm border px-3 py-2 text-xs uppercase tracking-[0.2em] text-ivory hover:border-gold disabled:opacity-40";

/** Guided ~1 minute reflection. Narration uses the device's built-in voice (no paid generation). */
export function Meditation({ path, onCue, onExit }: { path: Path; onCue: (c: Cue | null) => void; onExit: () => void }) {
  const steps = useRef(meditationTimeline(path)).current;
  const [mode, setMode] = useState<Mode | null>(null);
  const [elapsed, setElapsed] = useState(0), [paused, setPaused] = useState(false), [muted, setMuted] = useState(false), [volume, setVolume] = useState(0.8);
  const spoken = useRef(-1);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const i = mode ? stepAt(steps, elapsed) : -1, done = i >= steps.length;

  useEffect(() => { if (!mode || paused || done) return; const t = setInterval(() => setElapsed((e) => e + 250), 250); return () => clearInterval(t); }, [mode, paused, done]);
  useEffect(() => { onCue(mode && !done && i >= 0 ? steps[i]!.cue : null); }, [i, mode, done, onCue, steps]);
  function speak(idx: number) {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    if (mode !== "audio" || muted || idx < 0 || idx >= steps.length) { duckAmbient(false); return; }
    const u = new SpeechSynthesisUtterance(steps[idx]!.text); u.rate = 0.85; u.pitch = 0.95; u.volume = volume;
    u.onend = () => duckAmbient(false); duckAmbient(true); speechSynthesis.speak(u);
  }
  useEffect(() => { if (paused || done || i < 0) return; if (spoken.current !== i) { spoken.current = i; speak(i); } }, [i, paused, done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (canSpeak) speechSynthesis.cancel(); duckAmbient(false); onCue(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePause() { if (!paused) { if (canSpeak) speechSynthesis.cancel(); duckAmbient(false); } else { spoken.current = i; speak(i); } setPaused(!paused); }
  function toggleMute() { const m = !muted; setMuted(m); if (m) { if (canSpeak) speechSynthesis.cancel(); duckAmbient(false); } else if (!paused) speak(i); }
  function replay() { spoken.current = -1; setElapsed(0); setPaused(false); }

  if (!mode) return <div className="rounded-sm border bg-card/90 p-5 text-center">
    <p className="eyebrow">Guided reflection · about {Math.round(totalMs(steps) / 60000)} minute</p>
    <p className="mt-3 font-display text-lg text-ivory">Listen to the guidance or follow the captions. Keep your eyes open if you prefer.</p>
    {!canSpeak && <p className="mt-2 text-xs text-muted-foreground">Spoken guidance isn't available in this browser, so captions are shown.</p>}
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {canSpeak && <button className={btn} onClick={() => setMode("audio")}>Start · audio + captions</button>}
      <button className={btn} onClick={() => setMode("captions")}>Start · captions only</button>
      <button className={btn} onClick={onExit}>Exit</button>
    </div>
  </div>;

  return <div className="rounded-sm border bg-card/90 p-5 text-center">
    <div className="mx-auto h-0.5 w-full overflow-hidden bg-muted"><div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${Math.min(100, (elapsed / totalMs(steps)) * 100)}%` }} /></div>
    <p aria-live="polite" className="mt-4 min-h-[4.5rem] font-display text-xl italic text-ivory">{done ? "The reflection is complete." : steps[i]!.text}</p>
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {done ? <button className={btn} onClick={replay}>Replay</button> : <button className={btn} onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>}
      {mode === "audio" && <>
        <button className={btn} onClick={toggleMute} aria-pressed={muted}>{muted ? "Unmute" : "Mute"}</button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Volume
          <input type="range" min={0} max={1} step={0.1} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); setAmbientVolume(v * 0.15); }} aria-label="Volume" />
        </label>
      </>}
      <button className={btn} onClick={onExit}>Exit</button>
    </div>
  </div>;
}
