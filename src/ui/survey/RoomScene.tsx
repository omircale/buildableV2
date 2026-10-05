import { OrbitControls, Html, Line } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EQUIPMENT, wallsOf, type DesignResult, type Space } from '../../engine';
import { useResolvedTheme } from '../../state/uiStore';
import { buildExportScene, disposeExportScene } from '../ar/exportScene';

const MM = 0.001;

export interface RoomSceneLabels {
  heightUnknown: string;
  notPlaced: string;
  examplePosition: string;
  enterVr: string;
  exitVr: string;
  vrUnavailable: string;
}

export interface RoomSceneProps {
  space: Space;
  equipmentIds: string[];
  /** The piece from the editor, shown in the room when it is part of the bill. */
  design: DesignResult | null;
  designName: string;
  he: boolean;
  labels: RoomSceneLabels;
}

/** Signed area of a plan polygon — positive when it winds counter-clockwise. */
function signedArea(points: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function Label({ children, he, tone = 'muted' }: { children: React.ReactNode; he: boolean; tone?: 'muted' | 'accent' }) {
  return (
    <div
      dir={he ? 'rtl' : 'ltr'}
      className={`pointer-events-none whitespace-nowrap rounded-md px-2 py-1 text-caption leading-tight shadow-sm ${tone === 'accent' ? 'bg-accent text-on-accent' : 'bg-panel/95 text-ink'}`}
    >
      {children}
    </div>
  );
}

/**
 * The surveyed room in three dimensions, walkable in a headset where the browser supports WebXR.
 *
 * Built from the survey alone, so it can only show what was measured. Walls are single-sided planes
 * facing into the room: from outside, the near walls vanish and you look in; inside a headset, every
 * wall is around you. With no ceiling height there are no walls, because any height drawn would be
 * invented. Equipment has no size until a model is chosen and no position until someone places it, so
 * it appears as a labelled pin rather than a box of plausible dimensions.
 */
export function RoomScene({ space, equipmentIds, design, designName, he, labels }: RoomSceneProps) {
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  // A browser with no WebXR at all is known at first render; null means "has WebXR, still asking".
  const [vrSupported, setVrSupported] = useState<boolean | null>(() => ((navigator as Navigator & { xr?: XRSystem }).xr ? null : false));
  const [inVr, setInVr] = useState(false);
  // The scene sits inside the page, so its backdrop is the page's sunken surface in either theme. The
  // two values are --color-sunken from index.css; reading the variable during render would return the
  // previous theme's, because the theme attribute is written after it.
  const backdrop = useResolvedTheme() === 'dark' ? '#1b1916' : '#efebe4';

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) return;
    xr.isSessionSupported('immersive-vr')
      .then(setVrSupported)
      .catch(() => setVrSupported(false));
  }, []);

  const geometry = useMemo(() => {
    const f = space.footprintMm;
    if (f.length < 3) return null;
    const xs = f.map((p) => p.x);
    const ys = f.map((p) => p.y);
    const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * MM;
    const cz = ((Math.min(...ys) + Math.max(...ys)) / 2) * MM;
    const width = (Math.max(...xs) - Math.min(...xs)) * MM;
    const depth = (Math.max(...ys) - Math.min(...ys)) * MM;
    const ccw = signedArea(f) > 0;
    const h = space.heightMm != null ? space.heightMm * MM : null;

    const shape = new THREE.Shape(f.map((p) => new THREE.Vector2(p.x * MM - cx, p.y * MM - cz)));

    const walls = wallsOf(space).map((w) => {
      const ax = w.from.x * MM - cx;
      const az = w.from.y * MM - cz;
      const bx = w.to.x * MM - cx;
      const bz = w.to.y * MM - cz;
      const len = Math.hypot(bx - ax, bz - az);
      // The inside of the room lies to the left of each edge when the outline winds counter-clockwise.
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      const nx = ccw ? -dz : dz;
      const nz = ccw ? dx : -dx;
      return { id: w.id, built: w.built, len, mid: [(ax + bx) / 2, (az + bz) / 2] as const, rotY: Math.atan2(nx, nz), a: [ax, az] as const, b: [bx, bz] as const };
    });

    return { shape, walls, width, depth, h };
  }, [space]);

  const piece = useMemo(() => (design ? buildExportScene(design, { projectName: designName }) : null), [design, designName]);
  useEffect(() => () => void (piece && disposeExportScene(piece)), [piece]);

  if (!geometry) return null;
  const { shape, walls, width, depth, h } = geometry;

  // Items with no position yet stand in a row across the middle of the room, marked as not placed.
  const items = equipmentIds.map((id, i) => ({ key: `${id}-${i}`, item: EQUIPMENT.find((e) => e.id === id) }));
  const spacing = Math.min(1.8, (width * 0.8) / Math.max(1, items.length - 1));
  const rowZ = -depth * 0.1;

  // The piece stands against the far wall, turned to face into the room. The position is an example.
  const pieceDepth = design ? design.model.overall.z * MM : 0;
  const pieceWidth = design ? design.model.overall.x * MM : 0;
  const pieceHeight = design ? design.model.overall.y * MM : 0;

  const enterVr = async () => {
    const gl = glRef.current;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!gl || !xr) return;
    const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    gl.xr.enabled = true;
    gl.xr.setReferenceSpaceType('local-floor');
    await gl.xr.setSession(session);
    setInVr(true);
    session.addEventListener('end', () => setInVr(false));
  };

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, Math.max(2.4, (h ?? 2.7) * 0.95), -(depth / 2 + Math.max(width, depth) * 0.75)], fov: 50, near: 0.05, far: 200 }}
        onCreated={({ gl }) => {
          glRef.current = gl;
          gl.xr.enabled = true;
        }}
      >
        <color attach="background" args={[backdrop]} />
        <hemisphereLight args={['#ffffff', '#e4ded2', 2.6]} />
        <directionalLight position={[3, 6, -4]} intensity={1.4} />

        <mesh rotation-x={Math.PI / 2} position-y={0}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color="#d9d2c4" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>

        {walls.map((w) =>
          w.built ? (
            h != null && (
              <mesh key={w.id} position={[w.mid[0], h / 2, w.mid[1]]} rotation-y={w.rotY}>
                <planeGeometry args={[w.len, h]} />
                <meshStandardMaterial color="#f6f3ee" roughness={0.9} />
              </mesh>
            )
          ) : (
            <Line key={w.id} points={[[w.a[0], 0.01, w.a[1]], [w.b[0], 0.01, w.b[1]]]} color="#b5652b" lineWidth={2} dashed dashSize={0.2} gapSize={0.12} />
          ),
        )}

        {h == null && (
          <Html position={[0, 0.4, 0]} center>
            <Label he={he}>{labels.heightUnknown}</Label>
          </Html>
        )}

        {items.map(({ key, item }, i) => {
          const x = (i - (items.length - 1) / 2) * spacing;
          // Neighbouring pins stand at two heights so their labels do not sit on top of each other.
          const top = i % 2 === 0 ? 1.1 : 1.65;
          return (
            <group key={key} position={[x, 0, rowZ]}>
              <mesh position-y={top / 2}>
                <cylinderGeometry args={[0.012, 0.012, top, 8]} />
                <meshStandardMaterial color="#b5652b" />
              </mesh>
              <mesh position-y={top + 0.02}>
                <sphereGeometry args={[0.05, 16, 12]} />
                <meshStandardMaterial color="#b5652b" />
              </mesh>
              <Html position={[0, top + 0.22, 0]} center>
                <Label he={he}>
                  <strong className="font-semibold">{item ? (he ? item.nameHe : item.nameEn) : key}</strong>
                  <br />
                  <span className="text-muted">{labels.notPlaced}</span>
                </Label>
              </Html>
            </group>
          );
        })}

        {piece && (
          <group position={[0, 0, depth / 2 - pieceDepth / 2 - 0.02]} rotation-y={Math.PI}>
            <primitive object={piece} />
            <Html position={[0, pieceHeight + 0.2, 0]} center>
              <Label he={he} tone="accent">
                <strong className="font-semibold">{designName}</strong>
                <br />
                {labels.examplePosition}
                {pieceWidth > width + 0.001 && ' ⚠'}
              </Label>
            </Html>
          </group>
        )}

        <OrbitControls target={[0, 0.9, 0]} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={1} maxDistance={40} makeDefault />
      </Canvas>

      <div className="absolute bottom-3 start-3 end-3 flex flex-wrap items-center gap-2">
        {vrSupported ? (
          inVr ? (
            <button type="button" className="rounded-lg bg-panel px-3 py-2 text-small font-medium shadow" onClick={() => glRef.current?.xr.getSession()?.end()}>
              {labels.exitVr}
            </button>
          ) : (
            <button type="button" className="rounded-lg bg-accent px-3 py-2 text-small font-medium text-on-accent shadow" onClick={() => void enterVr()}>
              {labels.enterVr}
            </button>
          )
        ) : (
          vrSupported === false && <span className="rounded-lg bg-panel/90 px-3 py-2 text-small text-muted shadow-sm">{labels.vrUnavailable}</span>
        )}
      </div>
    </div>
  );
}

export default RoomScene;
