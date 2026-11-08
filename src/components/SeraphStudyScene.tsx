import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { advanceStudy, buildSeraphStudy, initialPlayback, type StudyConfig } from "@/lib/seraph-study";
import { mulberry32 } from "@/lib/manifest";
import { HOUNDSTOOTH_TOOTH } from "@/components/SeraphV2";
import OtherEntitySculptures from "./OtherEntitySculptures";
import { buildEntityStudy, type StudyIdentity } from "@/lib/entity-study";
import type { Intention } from "@/lib/manifest";

// grab: ring whose node handle is being dragged; gx/gy: that drag's offset in pixels.
type Input = { held: boolean; x: number; y: number; reduced: boolean; tap: boolean; grab?: number | null; gx?: number; gy?: number };
type Palette = { gold: string; ivory: string; ink: string; white: string; black: string };

function ribbonGeometry(wing: StudyConfig["wings"][number]) {
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  const rows = 72, cols = 8;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    // A returning, curled strip, not a flat petal. UVs follow its woven surface.
    const a = t * Math.PI * 1.68;
    const x = .4 + Math.sin(a * .58) * wing.length;
    const y = Math.sin(a) * .57;
    const z = Math.sin(a + .7) * wing.curl + wing.depth;
    const width = wing.width * (.5 + .5 * Math.sin(Math.PI * t));
    for (let j = 0; j <= cols; j++) {
      const v = j / cols - .5;
      vertices.push(x, y + v * width * 2, z + Math.sin(v * Math.PI) * .12 + Math.cos(v * Math.PI) * .06);
      uv.push(t * 4, j / cols);
      if (i < rows && j < cols) {
        const n = i * (cols + 1) + j;
        indices.push(n, n + cols + 1, n + 1, n + 1, n + cols + 1, n + cols + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function irisTexture(seed: number, p: Palette) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();
  const r = mulberry32(seed), center = 256;
  const gradient = context.createRadialGradient(center, center, 60, center, center, 245);
  gradient.addColorStop(0, p.ink); gradient.addColorStop(.29, p.gold); gradient.addColorStop(.74, p.ivory); gradient.addColorStop(1, p.ink);
  context.fillStyle = gradient; context.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const a = r() * Math.PI * 2, inner = 74 + r() * 60, outer = 170 + r() * 80;
    context.strokeStyle = i % 3 ? p.ink : p.gold; context.globalAlpha = .14 + r() * .45; context.lineWidth = .5 + r() * 2;
    context.beginPath(); context.moveTo(center + Math.cos(a) * inner, center + Math.sin(a) * inner);
    context.quadraticCurveTo(center + Math.cos(a + .03) * 170, center + Math.sin(a + .03) * 170, center + Math.cos(a) * outer, center + Math.sin(a) * outer); context.stroke();
  }
  context.globalAlpha = 1; context.fillStyle = p.ink; context.beginPath(); context.arc(center, center, 72, 0, Math.PI * 2); context.fill();
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

function Sculpture({ config, palette, input, host }: { config: StudyConfig; palette: Palette; input: React.RefObject<Input>; host: React.RefObject<HTMLDivElement | null> }) {
  const root = useRef<THREE.Group>(null), eye = useRef<THREE.Group>(null), lid = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Group | null)[]>([]), rings = useRef<(THREE.Group | null)[]>([]);
  const particles = useRef<THREE.Points>(null), state = useRef(initialPlayback());
  // Collector-turned ring orientation persists after release; live drag adds on top.
  const ringTurn = useRef([0, 1, 2].map(() => ({ x: 0, y: 0 }))), lastGrab = useRef<{ i: number; x: number; y: number } | null>(null);
  const { gl } = useThree();
  const assets = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 4 4"><rect width="4" height="4" fill="${palette.white}"/><g fill="${palette.black}"><polygon points="${HOUNDSTOOTH_TOOTH}"/><polygon points="4,0 4,1 3,0"/><polygon points="0,4 1,4 0,3"/></g></svg>`;
    const texture = new THREE.TextureLoader().load(`data:image/svg+xml,${encodeURIComponent(svg)}`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(config.weaveRepeat, 2.5); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    const geometries = config.wings.map(ribbonGeometry);
    const seams = config.wings.map(w => [-1, 1].map(side => {
      const points = Array.from({ length: 73 }, (_, i) => {
        const t = i / 72, a = t * Math.PI * 1.68, width = w.width * (.5 + .5 * Math.sin(Math.PI * t));
        return new THREE.Vector3(.4 + Math.sin(a * .58) * w.length, Math.sin(a) * .57 + side * width, Math.sin(a + .7) * w.curl + w.depth + side * .12);
      });
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, .009, 5, false);
    }));
    const iris = irisTexture(config.irisSeed, palette);
    const random = mulberry32(config.seed ^ 7654), positions = new Float32Array(100 * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = (random() - .5) * 8;
    return { texture, geometries, seams, iris, positions };
  }, [config, palette, gl]);
  useEffect(() => () => { assets.texture.dispose(); assets.iris.dispose(); assets.geometries.forEach(g => g.dispose()); assets.seams.flat().forEach(g => g.dispose()); }, [assets]);
  useFrame((_, delta) => {
    const s = state.current;
    if (input.current.tap) { s.ripple = 1; input.current.tap = false; }
    advanceStudy(s, delta, input.current);
    const t = s.time * config.rhythm, motion = input.current.reduced ? .15 : 1;
    if (root.current) {
      root.current.rotation.y = s.x * .16 + Math.sin(t * .22) * .045 * motion;
      root.current.rotation.x = -s.y * .1;
      root.current.position.y = Math.sin(t) * .04 * motion;
    }
    wings.current.forEach((wing, i) => {
      if (!wing) return; const w = config.wings[i]; if (!w) return;
      wing.rotation.z = w.angle + Math.sin(t + w.phase) * .055 * motion;
      wing.rotation.y = Math.sin(t * .72 + w.phase) * .13 * motion;
      wing.position.z = Math.sin(t + w.phase) * .045 * motion + s.ripple * Math.sin(i + s.ripple * 9) * .09;
    });
    const grab = input.current.grab ?? null;
    if (grab !== null) lastGrab.current = { i: grab, x: (input.current.gx ?? 0) / 90, y: (input.current.gy ?? 0) / 90 };
    else if (lastGrab.current) { const g = lastGrab.current, turn = ringTurn.current[g.i]; if (turn) { turn.x += g.y; turn.y += g.x; } lastGrab.current = null; }
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      const turn = ringTurn.current[i] ?? { x: 0, y: 0 }, live = lastGrab.current?.i === i ? lastGrab.current : null;
      ring.rotation.set(.6 + i * .57 + turn.x + (live?.y ?? 0) + Math.sin(t * .28 + i) * .16 * motion, i * .83 + turn.y + (live?.x ?? 0) + t * .05 * motion, i * .7 + t * .025 * motion);
      ring.scale.setScalar(1 + s.ripple * .045 * Math.sin(s.ripple * 12 - i));
    });
    if (eye.current) { eye.current.position.x = s.x * .065 + Math.sin(t * .57) * .025 * motion; eye.current.position.y = s.y * .035 + Math.sin(t * .32) * .018 * motion; }
    if (lid.current) { const blinkPhase = s.time % 9; const blink = !input.current.reduced && blinkPhase > 8.55 ? Math.sin((blinkPhase - 8.55) / .45 * Math.PI) : 0; lid.current.scale.y = 1 - blink * .96; }
    if (particles.current) particles.current.rotation.z = t * .012 * motion;
    if (host.current) {
      host.current.dataset["sceneReady"] = "true";
      host.current.dataset["rhythm"] = s.speed.toFixed(3);
      host.current.dataset["gaze"] = `${s.x.toFixed(2)},${s.y.toFixed(2)}`;
      host.current.dataset["ripple"] = s.ripple.toFixed(2);
      host.current.dataset["sceneTime"] = s.time.toFixed(2);
      host.current.dataset["drawCalls"] = String(gl.info.render.calls);
      host.current.dataset["triangles"] = String(gl.info.render.triangles);
    }
  });
  const goldMaterial = <meshStandardMaterial color={palette.gold} metalness={.88} roughness={.24} />;
  return <>
    <ambientLight intensity={.65} />
    <directionalLight position={[2, 4, 5]} intensity={3.5} color={palette.ivory} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-bias={-.001} />
    <pointLight position={[-3, -.5, 3]} color={palette.gold} intensity={14} />
    <Environment resolution={128} frames={1}>
      <Lightformer position={[0, 3, 4]} intensity={3} scale={[6, 2, 1]} color={palette.ivory} />
      <Lightformer position={[-4, 0, 1]} rotation-y={Math.PI / 2} intensity={2} scale={[4, 6, 1]} color={palette.gold} />
      <Lightformer position={[3, -2, 1]} intensity={2} scale={[3, 1, 1]} color={palette.ivory} />
    </Environment>
    <group ref={root}>
      {config.wings.map((w, i) => {
        const geometry = assets.geometries[i];
        if (!geometry) return null;
        return <group key={i} ref={node => { wings.current[i] = node; }} rotation-z={w.angle}>
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial map={assets.texture} side={THREE.DoubleSide} roughness={.42} metalness={.12} />
        </mesh>
        {assets.seams[i]?.map((seam, j) => <mesh key={j} geometry={seam}>{goldMaterial}</mesh>)}
        <mesh position={[.42, 0, w.depth]} rotation-y={Math.PI / 2}><torusGeometry args={[.12, .018, 8, 32]} />{goldMaterial}</mesh>
      </group>; })}
      {[1.95, 2.12, 2.32].map((radius, i) => <group key={i} ref={node => { rings.current[i] = node; }}>
        <mesh castShadow><torusGeometry args={[radius, i === 0 ? .025 : .012, 8, 128]} />{goldMaterial}</mesh>
        {[0, Math.PI].map(a => <group key={a} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]}>
          <mesh><sphereGeometry args={[.075, 16, 12]} />{goldMaterial}</mesh>
          {/* Larger invisible handle so a fingertip can catch the node. */}
          <mesh onPointerDown={e => { e.stopPropagation(); input.current.grab = i; input.current.gx = 0; input.current.gy = 0; if (host.current) host.current.style.cursor = "grabbing"; }}
            onPointerOver={() => { if (host.current && input.current.grab == null) host.current.style.cursor = "grab"; }} onPointerOut={() => { if (host.current && input.current.grab == null) host.current.style.cursor = ""; }}>
            <sphereGeometry args={[.28, 8, 6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>)}
      </group>)}
      <group position={[0, 0, .64]}>
        <mesh scale={[.78, .48, .36]} castShadow receiveShadow><sphereGeometry args={[1, 48, 32]} /><meshStandardMaterial color={palette.gold} metalness={.7} roughness={.36} /></mesh>
        <group ref={lid} position={[0, 0, .1]}>
          <mesh scale={[.72, .39, .32]}><sphereGeometry args={[1, 48, 32]} /><meshPhysicalMaterial color={palette.ivory} roughness={.2} clearcoat={1} /></mesh>
          <group ref={eye} position={[0, 0, .31]}>
            <mesh position={[0, 0, .04]}><circleGeometry args={[.295, 64]} /><meshPhysicalMaterial map={assets.iris} roughness={.3} clearcoat={1} /></mesh>
            <mesh position={[0, 0, .048]} scale={[1, 1, .25]}><sphereGeometry args={[.085, 32, 20]} /><meshPhysicalMaterial color={palette.ink} roughness={.08} clearcoat={1} /></mesh>
            <mesh position={[-.09, .13, .075]} scale={[1, .5, 1]}><sphereGeometry args={[.038, 16, 12]} /><meshBasicMaterial color={palette.ivory} /></mesh>
            <mesh position={[.1, -.09, .063]}><sphereGeometry args={[.012, 12, 8]} /><meshBasicMaterial color={palette.ivory} /></mesh>
          </group>
          {[1, -1].map(sign => <mesh key={sign} scale={[.77, .43 * sign, 1]} position={[0, 0, .12]}><torusGeometry args={[1, .028, 8, 64, Math.PI]} />{goldMaterial}</mesh>)}
        </group>
        <mesh position={[0, 0, -.12]} rotation-z={Math.PI / 4}><torusGeometry args={[.83, .015, 8, 64]} />{goldMaterial}</mesh>
      </group>
    </group>
    <points ref={particles}><bufferGeometry><bufferAttribute attach="attributes-position" args={[assets.positions, 3]} /></bufferGeometry><pointsMaterial color={palette.gold} size={.017} transparent opacity={.6} sizeAttenuation /></points>
  </>;
}

export default function SeraphStudyScene({ identity = "seraph", seed = 408325749, path = "remember" }: { identity?: StudyIdentity; seed?: number; path?: Intention }) {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<Input>({ held: false, x: 0, y: 0, reduced: false, tap: false });
  const gesture = useRef<{ id: number; x: number; y: number; started: number; moved: boolean } | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null), [active, setActive] = useState(true), [failed, setFailed] = useState(false);
  const config = useMemo(() => {
    const base = buildSeraphStudy(seed, path);
    if (seed === 408325749 && path === "remember") return base;
    return { ...base, wings: base.wings.map(w => ({ ...w,
      length: w.length * (path === "become" ? 1.18 : path === "receive" ? 1.05 : path === "release" ? 1.08 : 1),
      width: w.width * (path === "receive" ? 1.4 : path === "release" ? .8 : 1),
      curl: w.curl * (path === "remember" ? 1.15 : path === "release" ? .65 : .9),
      depth: w.depth * (path === "release" ? 2 : 1),
    })) };
  }, [seed, path]);
  const otherConfig = useMemo(() => buildEntityStudy(identity, seed, path), [identity, seed, path]);
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    // Resolve semantic CSS tokens for WebGL, which cannot consume var()/oklch().
    const resolve = (token: string) => {
      const el = document.createElement("span"); el.style.color = `var(${token})`; document.body.appendChild(el);
      const value = getComputedStyle(el).color; el.remove();
      const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d");
      if (!ctx) return style.getPropertyValue(token).trim();
      ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); const pixel = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
    };
    setPalette({ gold: resolve("--gold"), ivory: resolve("--ivory"), ink: resolve("--void"), white: resolve("--weave-white"), black: resolve("--weave-black") });
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => { input.current.reduced = media.matches; if (host.current) host.current.dataset["reducedMotion"] = String(media.matches); }; reduced(); media.addEventListener("change", reduced);
    let visible = true;
    const visibility = () => { setActive(visible && !document.hidden); if (document.hidden) input.current.held = false; };
    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; visibility(); }, { threshold: .08 });
    if (host.current) observer.observe(host.current); document.addEventListener("visibilitychange", visibility);
    // While a ring node is held, the finger turns the ring instead of scrolling the page.
    // iPhone (and Nimiq Pay's web view) cancels pointer drags when it starts scrolling, so touch
    // uses native touch events: sideways drags and node drags are ours, vertical swipes scroll.
    const stage = host.current;
    const touch = { axis: "" as "" | "x" | "y" };
    const onStart = (event: TouchEvent) => {
      const t = event.touches[0]; if (!t || event.touches.length > 1) { endTouch(true); return; }
      gesture.current = { id: -1, x: t.clientX, y: t.clientY, started: performance.now(), moved: false }; touch.axis = ""; input.current.held = true;
    };
    const onMove = (event: TouchEvent) => {
      const g = gesture.current, t = event.touches[0]; if (!g || !t) return;
      const dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
      if (input.current.grab != null) { event.preventDefault(); input.current.gx = dx; input.current.gy = dy; return; }
      if (!touch.axis && g.moved) touch.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (touch.axis === "y") { endTouch(true); return; }
      if (touch.axis === "x") { event.preventDefault(); input.current.x = dx / 70; input.current.y = -dy / 70; }
    };
    const endTouch = (cancel: boolean) => { if (gesture.current) end(cancel); };
    const onEnd = () => endTouch(false), onCancel = () => endTouch(true);
    stage?.addEventListener("touchstart", onStart, { passive: true });
    stage?.addEventListener("touchmove", onMove, { passive: false });
    stage?.addEventListener("touchend", onEnd); stage?.addEventListener("touchcancel", onCancel);
    return () => { stage?.removeEventListener("touchstart", onStart); stage?.removeEventListener("touchmove", onMove); stage?.removeEventListener("touchend", onEnd); stage?.removeEventListener("touchcancel", onCancel); observer.disconnect(); media.removeEventListener("change", reduced); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const end = (cancel: boolean) => {
    const g = gesture.current;
    if (!cancel && g && !g.moved && performance.now() - g.started < 450) input.current.tap = true;
    gesture.current = null; input.current.held = false; input.current.x = 0; input.current.y = 0; input.current.grab = null; if (host.current) host.current.style.cursor = "";
  };
  return <div ref={host} className="seraph-study-stage" role="img" aria-label={`Interactive ${identity} sculpture, ${path} path`} data-identity={identity} data-seed={seed} data-path={path} data-renderer-version="3" data-active={active}
    onPointerDown={e => { if (e.pointerType === "touch" || gesture.current) return; gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, started: performance.now(), moved: false }; input.current.held = true; }}
    onPointerMove={e => {
      if (e.pointerType === "touch") return;
      const g = gesture.current; if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
      // Vertical touch scrolling remains native; horizontal drags get bounded parallax.
      if (input.current.grab != null) {
        // Turning a ring by its node: keep the gesture even when it moves vertically.
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
        input.current.gx = dx; input.current.gy = dy; return;
      }
      if (e.pointerType === "touch" && Math.abs(dy) > Math.abs(dx) + 12) { end(true); return; }
      if (Math.abs(dx) > 10 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
      input.current.x = dx / 110; input.current.y = -dy / 110;
    }} onPointerUp={e => { if (e.pointerType !== "touch") end(false); }} onPointerCancel={e => { if (e.pointerType !== "touch") end(true); }} onLostPointerCapture={e => { if (e.pointerType !== "touch") end(true); }} onPointerLeave={e => { if (e.pointerType !== "touch" && !host.current?.hasPointerCapture(gesture.current?.id ?? -1)) end(true); }}>
    {failed ? <p className="p-8 text-center text-muted-foreground">The sculpture needs WebGL. Please open this study in a browser with graphics enabled.</p> : palette && <Canvas shadows dpr={[1, 1.5]} frameloop={active ? "always" : "never"} camera={{ position: [0, 0, 7.8], fov: 40 }} gl={{ antialias: true, alpha: true, powerPreference: "low-power" }} onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", () => setFailed(true)); }} fallback={<p className="p-8 text-muted-foreground">WebGL is unavailable in this browser.</p>}>
      {identity === "seraph" ? <Sculpture config={config} palette={palette} input={input} host={host} /> : <OtherEntitySculptures config={otherConfig} palette={palette} input={input} host={host} />}
    </Canvas>}
  </div>;
}