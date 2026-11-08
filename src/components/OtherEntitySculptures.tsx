import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HOUNDSTOOTH_TOOTH } from "./SeraphV2";
import { advanceStudy, initialPlayback } from "@/lib/seraph-study";
import type { EntityStudyConfig } from "@/lib/entity-study";

type Input = { held: boolean; x: number; y: number; reduced: boolean; tap: boolean };
type Palette = { gold: string; ivory: string; ink: string; white: string; black: string };

function annulus(radius: number, width: number) {
  const p: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= 128; i++) for (let j = 0; j <= 8; j++) {
    const a = i / 128 * Math.PI * 2, v = j / 8, r = radius + (v - .5) * width;
    p.push(Math.cos(a) * r, Math.sin(a) * r, Math.sin(v * Math.PI) * .10); uv.push(i / 128 * 4, v * .25);
    if (i < 128 && j < 8) { const n = i * 9 + j; idx.push(n, n + 9, n + 1, n + 1, n + 9, n + 10); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function fold(config: EntityStudyConfig, index: number) {
  const p: number[] = [], uv: number[] = [], idx: number[] = [], part = config.parts[index];
  const count = config.count, base = index / count * Math.PI * 2;
  const tall = config.path === "become" ? 1.22 : config.path === "receive" ? .9 : 1;
  const spread = config.path === "release" ? 1.26 : config.path === "remember" ? .82 : 1;
  for (let i = 0; i <= 48; i++) for (let j = 0; j <= 12; j++) {
    const t = i / 48, v = j / 12, a = base + (v - .5) * (Math.PI * 2 / count * 1.08) + Math.sin(t * 5 + (part?.phase ?? 0)) * .18;
    const r = (.42 + Math.sin(t * Math.PI) * .85 + t * .23) * spread * config.aspect;
    const pleat = Math.sin(v * Math.PI * 2) * (.12 + (part?.breadth ?? .2));
    p.push(Math.cos(a) * (r + pleat), (1.9 - t * 3.8) * tall + (part?.offset ?? 0), Math.sin(a) * (r + pleat)); uv.push(v * .75, t * 3);
    if (i < 48 && j < 12) { const n = i * 13 + j; idx.push(n, n + 13, n + 1, n + 1, n + 13, n + 14); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const seams = [0, 12].map(col => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 49 }, (_, row) => new THREE.Vector3(p[(row * 13 + col) * 3], p[(row * 13 + col) * 3 + 1], p[(row * 13 + col) * 3 + 2]))), 48, .012, 5, false));
  return { g, seams };
}

export default function OtherEntitySculptures({ config, palette, input, host }: { config: EntityStudyConfig; palette: Palette; input: React.RefObject<Input>; host: React.RefObject<HTMLDivElement | null> }) {
  const root = useRef<THREE.Group>(null), parts = useRef<(THREE.Group | null)[]>([]), state = useRef(initialPlayback());
  const assets = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 4 4"><rect width="4" height="4" fill="${palette.white}"/><g fill="${palette.black}"><polygon points="${HOUNDSTOOTH_TOOTH}"/><polygon points="4,0 4,1 3,0"/><polygon points="0,4 1,4 0,3"/></g></svg>`;
    const texture = new THREE.TextureLoader().load(`data:image/svg+xml,${encodeURIComponent(svg)}`); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(config.weave, config.weave); texture.colorSpace = THREE.SRGBColorSpace;
    const folds = config.identity === "veiled" ? Array.from({ length: config.count }, (_, i) => fold(config, i)) : [];
    const rings = config.identity === "orbital" ? Array.from({ length: config.count }, (_, i) => annulus(.85 + i * .25, config.parts[i]?.breadth ?? .2)) : [];
    return { texture, folds, rings };
  }, [config, palette]);
  useEffect(() => () => { assets.texture.dispose(); assets.rings.forEach(g => g.dispose()); assets.folds.forEach(f => { f.g.dispose(); f.seams.forEach(g => g.dispose()); }); }, [assets]);
  useFrame((_, delta) => {
    const s = state.current; if (input.current.tap) { s.ripple = 1; input.current.tap = false; } advanceStudy(s, delta, input.current);
    const t = s.time * config.rhythm, motion = input.current.reduced ? .12 : 1;
    if (root.current) { root.current.rotation.set(-s.y * .12, s.x * .3 + Math.sin(t * .2) * .09 * motion, 0); root.current.position.y = Math.sin(t) * .045 * motion; }
    parts.current.forEach((part, i) => {
      if (!part) return; const trait = config.parts[i]; if (!trait) return;
      if (config.identity === "orbital") {
        part.rotation.set(.3 + i * .65 + trait.tilt + (config.path === "become" ? .45 : 0), t * .18 * (i % 2 ? -1 : 1) * motion + trait.phase, i * .5 + Math.sin(t + trait.phase) * .12 * motion);
        part.position.x = config.path === "release" ? Math.sin(trait.phase) * .48 : trait.offset * .3;
        part.position.y = config.path === "become" ? (i - config.count / 2) * .16 : 0;
        part.scale.setScalar((config.path === "remember" ? .89 : config.path === "receive" ? 1.06 : 1) + Math.sin(t + trait.phase) * .025 * motion + s.ripple * .08);
      } else {
        const front = Math.sin(i / config.count * Math.PI * 2) > 0;
        part.rotation.y = Math.sin(t + trait.phase) * (config.path === "remember" ? .035 : .08) * motion + (front ? 1 : -1) * (config.opening + s.ripple * .25) * .4;
        const side = Math.cos(i / config.count * Math.PI * 2) >= 0 ? 1 : -1;
        part.position.x = (front ? side * (config.path === "release" ? .55 : config.opening * .7) : 0) + Math.cos(i / config.count * Math.PI * 2) * (Math.sin(t + trait.phase) * .075 * motion + s.ripple * .2);
        part.position.y = Math.sin(t + trait.phase) * .055 * motion;
      }
    });
    if (host.current) { host.current.dataset["sceneReady"] = "true"; host.current.dataset["sceneTime"] = s.time.toFixed(2); host.current.dataset["rhythm"] = s.speed.toFixed(3); host.current.dataset["gaze"] = `${s.x.toFixed(2)},${s.y.toFixed(2)}`; host.current.dataset["ripple"] = s.ripple.toFixed(2); }
  });
  const gold = <meshStandardMaterial color={palette.gold} metalness={.9} roughness={.22} />;
  return <>
    <ambientLight intensity={.85} /><directionalLight position={[2, 4, 5]} intensity={4} color={palette.ivory} /><pointLight position={[-3, 0, 3]} color={palette.gold} intensity={18} />
    <group ref={root} scale={config.identity === "veiled" ? .82 : 1}>
      {assets.rings.map((g, i) => <group key={i} ref={node => { parts.current[i] = node; }}>
        <mesh geometry={g}><meshPhysicalMaterial map={assets.texture} side={THREE.DoubleSide} roughness={.3} metalness={.22} clearcoat={1} /></mesh>
        {[-1, 1].map(sign => <mesh key={sign}><torusGeometry args={[.85 + i * .25 + sign * (config.parts[i]?.breadth ?? .2) / 2, .018, 8, 96]} />{gold}</mesh>)}
        {[0, Math.PI].map((a, j) => <group key={j} position={[Math.cos(a) * (.85 + i * .25), Math.sin(a) * (.85 + i * .25), .13]}>
          <mesh scale={[.21, .14, .12]}><sphereGeometry args={[1, 24, 16]} /><meshPhysicalMaterial color={palette.ivory} clearcoat={1} roughness={.18} /></mesh>
          <mesh position={[0, 0, .12]}><torusGeometry args={[.072, .015, 8, 24]} />{gold}</mesh><mesh position={[0, 0, .13]}><sphereGeometry args={[.043, 16, 12]} /><meshStandardMaterial color={palette.ink} roughness={.15} /></mesh>
        </group>)}
      </group>)}
      {assets.folds.map((f, i) => <group key={i} ref={node => { parts.current[i] = node; }}>
        <mesh geometry={f.g}><meshPhysicalMaterial map={assets.texture} side={THREE.DoubleSide} roughness={.45} metalness={.13} clearcoat={.3} /></mesh>
        {f.seams.map((g, j) => <mesh key={j} geometry={g}>{gold}</mesh>)}
      </group>)}
      {config.identity === "veiled" && <group>
        <pointLight color={palette.ivory} intensity={4} distance={3} />
        <mesh scale={[.38, .67, .38]}><sphereGeometry args={[1, 32, 24]} /><meshPhysicalMaterial color={palette.ivory} emissive={palette.ivory} emissiveIntensity={.45} roughness={.2} clearcoat={1} /></mesh>
        <mesh rotation-x={Math.PI / 2} position={[0, 1.85, 0]}><torusGeometry args={[.4, .035, 12, 64]} />{gold}</mesh>
      </group>}
    </group>
  </>;
}