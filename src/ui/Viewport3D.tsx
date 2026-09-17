import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Html, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { finishFor, getMaterial, supplierProductFor, type Component, type DesignResult, type Status } from '../engine';
import { useT } from '../i18n';
import { useDesign, type ViewMode } from '../state/designStore';
import { useResolvedTheme, useUi, type ViewStyle } from '../state/uiStore';
import { formatCm, partMeasureLabels } from './measure';

const MM = 0.001;

export const STATUS_COLOR: Record<Status, string> = { GREEN: '#2f7d4f', YELLOW: '#d08a00', RED: '#c62828', GREY: '#80868b' };

const SEVERITY: Record<Status, number> = { GREEN: 0, YELLOW: 1, GREY: 2, RED: 3 };

function componentStatuses(result: DesignResult): Map<string, Status> {
  const map = new Map<string, Status>();
  for (const check of result.report.checks) {
    for (const id of check.componentIds) {
      const prev = map.get(id);
      if (!prev || SEVERITY[check.status] > SEVERITY[prev]) map.set(id, check.status);
    }
  }
  return map;
}

function explodeOffset(c: Component, result: DesignResult): THREE.Vector3 {
  const { x: W, y: H } = result.model.overall;
  const k = 0.35;
  const cx = c.origin.x + c.size.x / 2 - W / 2;
  const cy = c.origin.y + c.size.y / 2 - H / 2;
  switch (c.role) {
    case 'side':
      return new THREE.Vector3(Math.sign(cx) * W * k, 0, 0);
    case 'back':
      return new THREE.Vector3(0, 0, -result.model.overall.z * 1.4);
    case 'top':
      return new THREE.Vector3(0, H * k * 0.4, 0);
    case 'bottom':
    case 'plinth':
      return new THREE.Vector3(0, -H * k * 0.25, c.role === 'plinth' ? result.model.overall.z * 0.6 : 0);
    case 'divider':
      return new THREE.Vector3(0, 0, result.model.overall.z * 0.9);
    case 'shelf':
      return new THREE.Vector3(0, cy * 0.15, result.model.overall.z * 0.5);
    case 'door':
      return new THREE.Vector3(0, 0, result.model.overall.z * 1.2);
    case 'mattress':
    case 'bar':
      return new THREE.Vector3(0, H * 0.6, 0);
    case 'slat':
      return new THREE.Vector3(0, H * 0.35, 0);
    case 'post':
    case 'rafter':
    case 'ridge':
    case 'header':
      return new THREE.Vector3(0, H * 0.25, 0);
    default: {
      // Everything else moves straight out from the centre of the piece, in plan.
      const D = result.model.overall.z;
      const cz = c.origin.z + c.size.z / 2 - D / 2;
      return new THREE.Vector3(Math.sign(Math.round(cx)) * W * k * 0.6, 0, Math.sign(Math.round(cz)) * D * k * 0.3);
    }
  }
}

const REFERENCE_COLOR: Partial<Record<Component['role'], string>> = { mattress: '#ece7de', bar: '#9aa1a6' };

function finishColor(c: Component, result: DesignResult): string {
  const p = result.model.params;
  if (c.reference) return REFERENCE_COLOR[c.role] ?? '#dddddd';
  if (c.role !== 'back' && (p.finish.type === 'painted' || p.finish.type === 'stained')) return p.finish.color;
  const material = getMaterial(c.materialId);
  const decor = supplierProductFor(material)?.product.finishes.find((f) => f.id === finishFor(c, p));
  return decor?.color ?? material?.defaultColor ?? '#cccccc';
}

function Board({ c, result, mode, status, selected, onSelect, edgeColor, viewStyle }: { c: Component; result: DesignResult; mode: ViewMode; status?: Status; selected: boolean; onSelect?: (id: string) => void; edgeColor: string; viewStyle: ViewStyle }) {
  const { x: W } = result.model.overall;
  const pos = new THREE.Vector3((c.origin.x + c.size.x / 2 - W / 2) * MM, (c.origin.y + c.size.y / 2) * MM, (c.origin.z + c.size.z / 2) * MM);
  if (mode === 'exploded') pos.add(explodeOffset(c, result).multiplyScalar(MM));

  const finish = result.model.params.finish;
  let color = finishColor(c, result);
  let opacity = 1;
  if (mode === 'structural') color = status ? STATUS_COLOR[status] : c.reference ? color : '#c9c3b8';
  if (mode === 'warnings') {
    if (status === 'RED' || status === 'YELLOW' || status === 'GREY') color = STATUS_COLOR[status];
    else opacity = 0.18;
  }
  if (c.role === 'back' && mode !== 'warnings') opacity = Math.min(opacity, mode === 'design' ? 1 : 0.35);

  const isDecorMode = mode === 'design' || mode === 'exploded' || mode === 'measure';
  const realistic = viewStyle === 'realistic' && isDecorMode;
  // Illustration mode reads as a diagram: flat color, no reflections, no per-fragment lighting variance.
  const roughness = !isDecorMode ? 1 : realistic ? (finish.sheen === 'gloss' ? 0.15 : finish.sheen === 'satin' ? 0.45 : 0.85) : 1;
  const metalness = realistic && finish.sheen === 'gloss' ? 0.1 : 0;

  return (
    <mesh
      position={pos}
      rotation={[0, 0, ((c.rotationZDeg ?? 0) * Math.PI) / 180]}
      castShadow={isDecorMode}
      receiveShadow={isDecorMode}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect(c.id);
      }}
    >
      <boxGeometry args={[c.size.x * MM, c.size.y * MM, c.size.z * MM]} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        flatShading={!realistic}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={selected ? '#c0763d' : '#000000'}
        emissiveIntensity={selected ? 0.35 : 0}
        toneMapped={realistic}
      />
      <Edges threshold={15} color={selected ? '#c0763d' : edgeColor} lineWidth={selected ? (realistic ? 1.2 : 2) : realistic ? 0.6 : 1} />
    </mesh>
  );
}

function DimensionLine({ from, to, label, offset }: { from: THREE.Vector3; to: THREE.Vector3; label: string; offset: THREE.Vector3 }) {
  const a = from.clone().add(offset);
  const b = to.clone().add(offset);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints([a, b]), [a.x, a.y, a.z, b.x, b.y, b.z]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <lineSegments geometry={geom}>
        <lineBasicMaterial color="#c0763d" />
      </lineSegments>
      <Html position={mid} center zIndexRange={[10, 0]}>
        <div className="num whitespace-nowrap rounded-md bg-panel/95 px-2 py-0.5 text-[13px] font-semibold text-accent-ink shadow ring-1 ring-accent/30">{label}</div>
      </Html>
    </group>
  );
}

function Measurements({ result }: { result: DesignResult }) {
  const t = useT();
  const L = t.viewport.dim;
  const cm = (mm: number) => `${formatCm(mm)} ${t.common.cm}`;
  const { x: W, y: H, z: D } = result.model.overall;
  const hw = (W / 2) * MM;
  const p = result.model.params;
  const shelf = p.template === 'open_shelf';
  // One bay-width line per bay (there's a bottom segment per bay, split at every divider), so adding a
  // divider shows the gap it actually creates on each side, not just the first bay.
  const bays = result.model.components.filter((c) => shelf && c.role === 'bottom').sort((a, b) => a.origin.x - b.origin.x);
  const firstBayCentre = bays.length ? bays[0].origin.x + bays[0].size.x / 2 : 0;
  const levels = result.model.components.filter((c) => shelf && ['bottom', 'shelf', 'top'].includes(c.role) && Math.abs(c.origin.x + c.size.x / 2 - firstBayCentre) < 1).sort((a, b) => a.origin.y - b.origin.y);
  const gap = levels.length > 1 ? levels[1].origin.y - (levels[0].origin.y + levels[0].size.y) : null;
  return (
    <group>
      <DimensionLine from={new THREE.Vector3(-hw, H * MM, D * MM)} to={new THREE.Vector3(hw, H * MM, D * MM)} offset={new THREE.Vector3(0, 0.08, 0)} label={`${L.width} ${cm(W)}`} />
      <DimensionLine from={new THREE.Vector3(hw, 0, D * MM)} to={new THREE.Vector3(hw, H * MM, D * MM)} offset={new THREE.Vector3(0.08, 0, 0)} label={`${L.height} ${cm(H)}`} />
      <DimensionLine from={new THREE.Vector3(hw, 0, 0)} to={new THREE.Vector3(hw, 0, D * MM)} offset={new THREE.Vector3(0.08, 0, 0)} label={`${L.depth} ${cm(D)}`} />
      {bays.map((b, i) => (
        <DimensionLine
          key={b.id}
          from={new THREE.Vector3((b.origin.x - W / 2) * MM, (b.origin.y + b.size.y) * MM, D * MM)}
          // Stagger the label height per bay so adjacent callouts don't overlap once there are several dividers.
          to={new THREE.Vector3((b.origin.x + b.size.x - W / 2) * MM, (b.origin.y + b.size.y) * MM, D * MM)}
          offset={new THREE.Vector3(0, 0.02 + (i % 2) * 0.045, 0.02)}
          label={bays.length > 1 ? `${L.span} ${i + 1}: ${cm(b.size.x)}` : `${L.span} ${cm(b.size.x)}`}
        />
      ))}
      {gap != null && levels.length > 1 && (
        <DimensionLine
          from={new THREE.Vector3((p.thicknessMm - W / 2) * MM + 0.03, (levels[0].origin.y + levels[0].size.y) * MM, D * MM)}
          to={new THREE.Vector3((p.thicknessMm - W / 2) * MM + 0.03, levels[1].origin.y * MM, D * MM)}
          offset={new THREE.Vector3(0, 0, 0.02)}
          label={`${L.gap} ${cm(gap)}`}
        />
      )}
    </group>
  );
}

/**
 * Dimensions of one component along its own three axes, drawn on the component itself.
 * The numbers are the modelled box — the same values as the cut list (verified by measure.test.ts).
 */
function PartMeasurements({ result, c }: { result: DesignResult; c: Component }) {
  const t = useT();
  const L = t.viewport.dim;
  const W = result.model.overall.x;
  const labels = partMeasureLabels(result.model, c, { ...L, cm: t.common.cm });
  const hx = (c.size.x / 2) * MM;
  const hy = (c.size.y / 2) * MM;
  const hz = (c.size.z / 2) * MM;
  const center = new THREE.Vector3((c.origin.x + c.size.x / 2 - W / 2) * MM, (c.origin.y + c.size.y / 2) * MM, (c.origin.z + c.size.z / 2) * MM);
  const o = 0.04;
  return (
    <group position={center} rotation={[0, 0, ((c.rotationZDeg ?? 0) * Math.PI) / 180]}>
      <DimensionLine from={new THREE.Vector3(-hx, hy, hz)} to={new THREE.Vector3(hx, hy, hz)} offset={new THREE.Vector3(0, o, o)} label={labels.x} />
      <DimensionLine from={new THREE.Vector3(hx, -hy, hz)} to={new THREE.Vector3(hx, hy, hz)} offset={new THREE.Vector3(o, 0, o)} label={labels.y} />
      <DimensionLine from={new THREE.Vector3(hx, -hy, -hz)} to={new THREE.Vector3(hx, -hy, hz)} offset={new THREE.Vector3(o, -o, 0)} label={labels.z} />
      {labels.cut && (
        <Html position={new THREE.Vector3(0, hy + 0.12, 0)} center zIndexRange={[10, 0]}>
          <div className="num whitespace-nowrap rounded-md bg-ink/90 px-2 py-0.5 text-[13px] font-semibold text-paper shadow">{labels.cut}</div>
        </Html>
      )}
    </group>
  );
}

export type CameraPreset = 'iso' | 'front' | 'side' | 'top';

function CameraRig({ preset, result, controls, focus }: { preset: { name: CameraPreset; nonce: number }; result: DesignResult; controls: React.RefObject<OrbitControlsImpl | null>; focus?: Component }) {
  const { camera } = useThree();
  const { x: W, y: H, z: D } = result.model.overall;
  useEffect(() => {
    // An isolated part is framed on its own; otherwise the whole piece.
    const size = (focus ? Math.max(focus.size.x, focus.size.y, focus.size.z, 300) : Math.max(W, H, D)) * MM;
    const target = focus
      ? new THREE.Vector3((focus.origin.x + focus.size.x / 2 - W / 2) * MM, (focus.origin.y + focus.size.y / 2) * MM, (focus.origin.z + focus.size.z / 2) * MM)
      : new THREE.Vector3(0, (H / 2) * MM, (D / 2) * MM);
    const dist = size * 2.4;
    const dirs: Record<CameraPreset, THREE.Vector3> = {
      iso: new THREE.Vector3(-0.75, 0.45, 1),
      front: new THREE.Vector3(0, 0.05, 1),
      side: new THREE.Vector3(-1, 0.1, 0.02),
      top: new THREE.Vector3(0, 1, 0.02),
    };
    camera.position.copy(target.clone().add(dirs[preset.name].normalize().multiplyScalar(dist)));
    controls.current?.target.copy(target);
    controls.current?.update();
    // Re-frame on explicit preset changes and when the furniture type changes, not on every dimension edit.
  }, [preset.nonce, result.model.params.template, focus?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function Viewport3D({ result, preset, preview = false }: { result: DesignResult; preset: { name: CameraPreset; nonce: number }; preview?: boolean }) {
  const theme = useResolvedTheme();
  const dark = theme === 'dark';
  const storeMode = useDesign((s) => s.viewMode);
  const mode = preview ? 'design' : storeMode;
  const viewStyle = useUi((s) => s.viewStyle);
  const selectedId = useDesign((s) => s.selectedId);
  const select = useDesign((s) => s.select);
  const isolated = useDesign((s) => s.isolated);
  const hidden = useDesign((s) => s.hiddenRoles);
  const selected = preview ? undefined : result.model.components.find((c) => c.id === selectedId);
  const focus = selected && isolated ? selected : undefined;
  const statuses = useMemo(() => componentStatuses(result), [result]);
  const controls = useRef<OrbitControlsImpl>(null);
  const { x: W, y: H, z: D } = result.model.overall;

  return (
    <Canvas shadows gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 35, near: 0.01, far: 100, position: [-1.6, 1.6, 3.2] }} onPointerMissed={() => !preview && select(null)}>
      <color attach="background" args={[dark ? '#1b1916' : '#efebe4']} />
      <hemisphereLight args={['#ffffff', dark ? '#6b6258' : '#d8cfc2', dark ? 0.75 : 0.9]} />
      <directionalLight position={[-2.5, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} />
      <directionalLight position={[3, 2, -2]} intensity={0.35} />
      {viewStyle === 'realistic' && (
        <>
          {/* A soft key/fill/rim trio (no external HDRI) so glossy finishes show a believable highlight and gradient, offline-safe. */}
          <directionalLight position={[1.5, 3, 4]} intensity={0.5} color={dark ? '#a9b8c9' : '#fff6e8'} />
          <pointLight position={[-1.5, 1.2, 2]} intensity={0.25} color={dark ? '#5b6b8c' : '#ffe3c2'} />
          <pointLight position={[0, 0.3, -1.5]} intensity={0.15} color="#ffffff" />
        </>
      )}
      <group>
        {result.model.components
          .filter((c) => preview || (focus ? c.id === focus.id : !hidden.includes(c.role)))
          .map((c) => (
            <Board key={c.id} c={c} result={result} mode={mode} status={statuses.get(c.id)} selected={!preview && selectedId === c.id} onSelect={preview ? undefined : select} edgeColor={dark ? '#1a1612' : '#3b342c'} viewStyle={viewStyle} />
          ))}
        {mode === 'measure' && (selected ? <PartMeasurements result={result} c={selected} /> : <Measurements result={result} />)}
      </group>
      <ContactShadows position={[0, -0.001, (D / 2) * MM]} scale={Math.max(W, D) * MM * 3} blur={2.2} opacity={viewStyle === 'realistic' ? (dark ? 0.7 : 0.5) : 0} far={H * MM} />
      <gridHelper key={theme} args={[6, 60, dark ? '#3a342d' : '#d6cec2', dark ? '#2a2520' : '#e4ddd2']} position={[0, -0.002, 0]} />
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} target={[0, (H / 2) * MM, (D / 2) * MM]} maxPolarAngle={Math.PI * 0.95} minDistance={0.3} maxDistance={12} />
      <CameraRig preset={preset} result={result} controls={controls} focus={focus} />
    </Canvas>
  );
}
