import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Html, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { getMaterial, type Component, type DesignResult, type Status } from '../engine';
import { useDesign, type ViewMode } from '../state/designStore';

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
  }
}

function finishColor(c: Component, result: DesignResult): string {
  const f = result.model.params.finish;
  if (c.role !== 'back' && (f.type === 'painted' || f.type === 'stained')) return f.color;
  return getMaterial(c.materialId)?.defaultColor ?? '#cccccc';
}

function Board({ c, result, mode, status, selected, onSelect }: { c: Component; result: DesignResult; mode: ViewMode; status?: Status; selected: boolean; onSelect: (id: string) => void }) {
  const { x: W } = result.model.overall;
  const pos = new THREE.Vector3((c.origin.x + c.size.x / 2 - W / 2) * MM, (c.origin.y + c.size.y / 2) * MM, (c.origin.z + c.size.z / 2) * MM);
  if (mode === 'exploded') pos.add(explodeOffset(c, result).multiplyScalar(MM));

  const finish = result.model.params.finish;
  let color = finishColor(c, result);
  let opacity = 1;
  if (mode === 'structural') color = status ? STATUS_COLOR[status] : '#c9c3b8';
  if (mode === 'warnings') {
    if (status === 'RED' || status === 'YELLOW' || status === 'GREY') color = STATUS_COLOR[status];
    else opacity = 0.18;
  }
  if (c.role === 'back' && mode !== 'warnings') opacity = Math.min(opacity, mode === 'design' ? 1 : 0.35);

  const roughness = finish.sheen === 'gloss' ? 0.25 : finish.sheen === 'satin' ? 0.5 : 0.8;

  return (
    <mesh
      position={pos}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect(c.id);
      }}
    >
      <boxGeometry args={[c.size.x * MM, c.size.y * MM, c.size.z * MM]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={0} transparent={opacity < 1} opacity={opacity} emissive={selected ? '#9a5b2e' : '#000000'} emissiveIntensity={selected ? 0.35 : 0} />
      <Edges threshold={15} color={selected ? '#9a5b2e' : '#3b342c'} lineWidth={selected ? 2 : 1} />
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
        <lineBasicMaterial color="#9a5b2e" />
      </lineSegments>
      <Html position={mid} center zIndexRange={[10, 0]}>
        <div className="num whitespace-nowrap rounded bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-accent shadow ring-1 ring-accent/30">{label}</div>
      </Html>
    </group>
  );
}

function Measurements({ result }: { result: DesignResult }) {
  const { x: W, y: H, z: D } = result.model.overall;
  const hw = (W / 2) * MM;
  const p = result.model.params;
  const bay = result.model.components.find((c) => c.role === 'shelf' || c.role === 'bottom');
  const levels = result.model.components.filter((c) => ['bottom', 'shelf', 'top'].includes(c.role) && c.origin.x === p.thicknessMm).sort((a, b) => a.origin.y - b.origin.y);
  const gap = levels.length > 1 ? levels[1].origin.y - (levels[0].origin.y + levels[0].size.y) : null;
  return (
    <group>
      <DimensionLine from={new THREE.Vector3(-hw, H * MM, D * MM)} to={new THREE.Vector3(hw, H * MM, D * MM)} offset={new THREE.Vector3(0, 0.08, 0)} label={`רוחב ${W}`} />
      <DimensionLine from={new THREE.Vector3(hw, 0, D * MM)} to={new THREE.Vector3(hw, H * MM, D * MM)} offset={new THREE.Vector3(0.08, 0, 0)} label={`גובה ${H}`} />
      <DimensionLine from={new THREE.Vector3(hw, 0, 0)} to={new THREE.Vector3(hw, 0, D * MM)} offset={new THREE.Vector3(0.08, 0, 0)} label={`עומק ${D}`} />
      {bay && (
        <DimensionLine
          from={new THREE.Vector3((bay.origin.x - W / 2) * MM, (bay.origin.y + bay.size.y) * MM, D * MM)}
          to={new THREE.Vector3((bay.origin.x + bay.size.x - W / 2) * MM, (bay.origin.y + bay.size.y) * MM, D * MM)}
          offset={new THREE.Vector3(0, 0.02, 0.02)}
          label={`מפתח ${Math.round(bay.size.x)}`}
        />
      )}
      {gap != null && levels.length > 1 && (
        <DimensionLine
          from={new THREE.Vector3((p.thicknessMm - W / 2) * MM + 0.03, (levels[0].origin.y + levels[0].size.y) * MM, D * MM)}
          to={new THREE.Vector3((p.thicknessMm - W / 2) * MM + 0.03, levels[1].origin.y * MM, D * MM)}
          offset={new THREE.Vector3(0, 0, 0.02)}
          label={`מרווח ${Math.round(gap)}`}
        />
      )}
    </group>
  );
}

export type CameraPreset = 'iso' | 'front' | 'side' | 'top';

function CameraRig({ preset, result, controls }: { preset: { name: CameraPreset; nonce: number }; result: DesignResult; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const { x: W, y: H, z: D } = result.model.overall;
  useEffect(() => {
    const size = Math.max(W, H, D) * MM;
    const target = new THREE.Vector3(0, (H / 2) * MM, (D / 2) * MM);
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
    // Re-frame only on explicit preset changes, not on every dimension edit.
  }, [preset.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function Viewport3D({ result, preset }: { result: DesignResult; preset: { name: CameraPreset; nonce: number } }) {
  const mode = useDesign((s) => s.viewMode);
  const selectedId = useDesign((s) => s.selectedId);
  const select = useDesign((s) => s.select);
  const hidden = useDesign((s) => s.hiddenRoles);
  const statuses = useMemo(() => componentStatuses(result), [result]);
  const controls = useRef<OrbitControlsImpl>(null);
  const { x: W, y: H, z: D } = result.model.overall;

  return (
    <Canvas shadows gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 35, near: 0.01, far: 100, position: [-1.6, 1.6, 3.2] }} onPointerMissed={() => select(null)}>
      <color attach="background" args={['#efebe4']} />
      <hemisphereLight args={['#ffffff', '#d8cfc2', 0.9]} />
      <directionalLight position={[-2.5, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} />
      <directionalLight position={[3, 2, -2]} intensity={0.35} />
      <group>
        {result.model.components
          .filter((c) => !hidden.includes(c.role))
          .map((c) => (
            <Board key={c.id} c={c} result={result} mode={mode} status={statuses.get(c.id)} selected={selectedId === c.id} onSelect={select} />
          ))}
        {mode === 'measure' && <Measurements result={result} />}
      </group>
      <ContactShadows position={[0, -0.001, (D / 2) * MM]} scale={Math.max(W, D) * MM * 3} blur={2.2} opacity={0.45} far={H * MM} />
      <gridHelper args={[6, 60, '#d6cec2', '#e4ddd2']} position={[0, -0.002, 0]} />
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} target={[0, (H / 2) * MM, (D / 2) * MM]} maxPolarAngle={Math.PI * 0.95} minDistance={0.3} maxDistance={12} />
      <CameraRig preset={preset} result={result} controls={controls} />
    </Canvas>
  );
}
