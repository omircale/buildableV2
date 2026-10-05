import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { DesignResult } from '../../engine';
import { IconRedo, IconUndo } from '../icons';
import { buildExportScene, disposeExportScene } from './exportScene';
import { distanceM, fitsWithin, formatDistance, turned } from './placement';

export interface ArPlacementLabels {
  start: string;
  exit: string;
  scanning: string;
  tapToPlace: string;
  placed: string;
  place: string;
  measure: string;
  measureFirst: string;
  measureSecond: string;
  measured: (distance: string) => string;
  fits: (name: string, width: string) => string;
  tooWide: (name: string, width: string) => string;
  turnLeft: string;
  turnRight: string;
  measureNote: string;
  failed: string;
}

type Mode = 'place' | 'measure';

/**
 * The designed piece, stood in the real room through the phone's camera, live.
 *
 * This is a WebXR session: the browser tracks the room, a ring follows the floor where the phone is
 * pointed, and a tap stands the piece there at its real size. It can then be turned, moved by tapping
 * elsewhere, and checked against a gap measured between two tapped points.
 *
 * The measurement is for judging a fit by eye. Phone tracking drifts by centimetres over a room, so the
 * screen says, next to every reading, that a dimension for a bill is taken with a tape or a laser.
 *
 * Only browsers that expose WebXR's `immersive-ar` reach this component — Chrome on Android today.
 * Everything a test can hold without a phone lives in `placement.ts`; the session itself can only be
 * exercised on a device.
 */
export function ArPlacement({ design, designName, he, labels }: { design: DesignResult; designName: string; he: boolean; labels: ArPlacementLabels }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const holderRef = useRef<THREE.Group | null>(null);
  const modeRef = useRef<Mode>('place');
  const yawRef = useRef(0);

  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<Mode>('place');
  const [surface, setSurface] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [points, setPoints] = useState(0);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const widthM = design.model.overall.x / 1000;

  // A tap on a button must not also count as a tap on the floor behind it.
  useEffect(() => {
    const el = controlsRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('beforexrselect', stop);
    return () => el.removeEventListener('beforexrselect', stop);
  }, []);

  // Leaving the page ends the session rather than leaving the camera running behind it.
  useEffect(() => () => void sessionRef.current?.end().catch(() => {}), []);

  const chooseMode = (next: Mode) => {
    modeRef.current = next;
    setMode(next);
  };

  const turn = (direction: 1 | -1) => {
    yawRef.current = turned(yawRef.current, direction);
    if (holderRef.current) holderRef.current.rotation.y = yawRef.current;
  };

  const start = async () => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    const overlay = overlayRef.current;
    if (!xr || !overlay) return;
    setError(null);
    // The overlay has to be on screen before the session asks for it.
    overlay.style.display = 'flex';

    let session: XRSession;
    try {
      session = await xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } });
    } catch {
      overlay.style.display = 'none';
      setError(labels.failed);
      return;
    }
    sessionRef.current = session;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(1, 3, 2);
    scene.add(sun);

    // The ring that follows the floor. Its matrix is written straight from the hit-test pose.
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.11, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf1b27e }));
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const piece = buildExportScene(design, { projectName: designName });
    const holder = new THREE.Group();
    holder.add(piece);
    holder.visible = false;
    scene.add(holder);
    holderRef.current = holder;

    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xb5652b });
    const markers = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), markerMaterial);
      m.visible = false;
      scene.add(m);
      return m;
    });
    const span = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xb5652b }));
    span.visible = false;
    scene.add(span);
    const measuredPoints: THREE.Vector3[] = [];

    await renderer.xr.setSession(session);
    const viewerSpace = await session.requestReferenceSpace('viewer');
    const hitSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;

    let hadSurface = false;
    renderer.setAnimationLoop((_time, frame) => {
      const reference = renderer.xr.getReferenceSpace();
      const pose = frame && hitSource && reference ? frame.getHitTestResults(hitSource)[0]?.getPose(reference) : undefined;
      reticle.visible = Boolean(pose);
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
      // React hears about the surface only when it appears or disappears, not on every frame.
      if (reticle.visible !== hadSurface) {
        hadSurface = reticle.visible;
        setSurface(hadSurface);
      }
      renderer.render(scene, camera);
    });

    session.addEventListener('select', () => {
      if (!reticle.visible) return;
      const at = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);

      if (modeRef.current === 'place') {
        if (!holder.visible) {
          // The first time, the piece is turned to face whoever is holding the phone.
          const eye = new THREE.Vector3();
          renderer.xr.getCamera().getWorldPosition(eye);
          yawRef.current = Math.atan2(eye.x - at.x, eye.z - at.z);
        }
        holder.position.copy(at);
        holder.rotation.y = yawRef.current;
        holder.visible = true;
        setPlaced(true);
        return;
      }

      // Measuring: a third tap starts a new measurement rather than extending the old one.
      if (measuredPoints.length === 2) measuredPoints.length = 0;
      measuredPoints.push(at);
      markers.forEach((m, i) => {
        m.visible = i < measuredPoints.length;
        if (measuredPoints[i]) m.position.copy(measuredPoints[i]);
      });
      span.visible = measuredPoints.length === 2;
      if (measuredPoints.length === 2) span.geometry.setFromPoints(measuredPoints);
      setPoints(measuredPoints.length);
      setDistance(measuredPoints.length === 2 ? distanceM(measuredPoints[0], measuredPoints[1]) : null);
    });

    session.addEventListener('end', () => {
      renderer.setAnimationLoop(null);
      hitSource?.cancel();
      disposeExportScene(piece);
      reticle.geometry.dispose();
      span.geometry.dispose();
      markers.forEach((m) => m.geometry.dispose());
      renderer.dispose();
      sessionRef.current = null;
      holderRef.current = null;
      overlay.style.display = 'none';
      modeRef.current = 'place';
      setActive(false);
      setMode('place');
      setSurface(false);
      setPlaced(false);
      setPoints(0);
      setDistance(null);
    });

    setActive(true);
  };

  const status = !surface
    ? labels.scanning
    : mode === 'place'
      ? placed
        ? labels.placed
        : labels.tapToPlace
      : distance != null
        ? labels.measured(formatDistance(distance, he))
        : points === 1
          ? labels.measureSecond
          : labels.measureFirst;

  const chip = 'rounded-full px-4 py-2.5 text-[0.875rem] font-medium shadow';

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void start()} className="inline-flex h-12 items-center justify-center rounded-lg bg-accent px-6 text-base font-semibold text-on-accent">
        {labels.start}
      </button>
      <p className="text-[0.7812rem] leading-snug text-muted">{labels.measureNote}</p>
      {error && <p className="text-[0.8125rem] text-bad">{error}</p>}

      {/* Shown full-screen over the camera while the session runs. */}
      <div ref={overlayRef} dir={he ? 'rtl' : 'ltr'} aria-hidden={!active} className="pointer-events-none fixed inset-0 z-50 flex-col justify-between p-4" style={{ display: 'none' }}>
        <div className="space-y-2">
          <p className="mx-auto w-fit max-w-full rounded-2xl bg-black/65 px-4 py-2 text-center text-[0.9375rem] text-white">{status}</p>
          {mode === 'measure' && distance != null && (
            <p className={`mx-auto w-fit max-w-full rounded-2xl px-4 py-2 text-center text-[0.875rem] text-white ${fitsWithin(widthM, distance) ? 'bg-emerald-700/85' : 'bg-red-700/85'}`}>
              {fitsWithin(widthM, distance) ? labels.fits(designName, formatDistance(widthM, he)) : labels.tooWide(designName, formatDistance(widthM, he))}
            </p>
          )}
          {mode === 'measure' && <p className="mx-auto w-fit max-w-full rounded-2xl bg-black/50 px-3 py-1.5 text-center text-[0.75rem] text-white">{labels.measureNote}</p>}
        </div>

        <div ref={controlsRef} className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 pb-2">
          <button type="button" onClick={() => chooseMode('place')} className={`${chip} ${mode === 'place' ? 'bg-white text-black' : 'bg-black/65 text-white'}`}>
            {labels.place}
          </button>
          <button type="button" onClick={() => chooseMode('measure')} className={`${chip} ${mode === 'measure' ? 'bg-white text-black' : 'bg-black/65 text-white'}`}>
            {labels.measure}
          </button>
          {placed && mode === 'place' && (
            <>
              <button type="button" aria-label={labels.turnLeft} onClick={() => turn(1)} className={`${chip} bg-black/65 text-white`}>
                <IconUndo size={20} />
              </button>
              <button type="button" aria-label={labels.turnRight} onClick={() => turn(-1)} className={`${chip} bg-black/65 text-white`}>
                <IconRedo size={20} />
              </button>
            </>
          )}
          <button type="button" onClick={() => void sessionRef.current?.end()} className={`${chip} bg-black/65 text-white`}>
            {labels.exit}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArPlacement;
