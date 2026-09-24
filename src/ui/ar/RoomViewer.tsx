import { useEffect, useRef } from 'react';
import '@google/model-viewer';

/**
 * The piece at 1:1 in the room, through `model-viewer`.
 *
 * This is the one component in the platform spec worth taking as written: it is the only path that
 * covers all three surfaces — Quick Look on iPhone, Scene Viewer on Android, WebXR in the browser —
 * without writing three integrations. The element is a custom element, so it is imported for its side
 * effect and driven through attributes rather than React props.
 *
 * It is loaded lazily on purpose. The package is large, and nobody pays for it until they ask to see
 * the piece in their room.
 */

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

export interface RoomViewerProps {
  /** Signed URL of the GLB — Android Scene Viewer, WebXR and the in-page render all use this. */
  glbUrl: string;
  /** Signed URL of the USDZ — what iOS Quick Look opens. */
  usdzUrl?: string;
  alt: string;
  arButtonLabel: string;
  /** Called when the element reports that this device cannot place the model in a room. */
  onArUnavailable?: () => void;
}

export function RoomViewer({ glbUrl, usdzUrl, alt, arButtonLabel, onArUnavailable }: RoomViewerProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The element tells us whether this device can do AR at all; saying so beats a button that does nothing.
    const onStatus = (e: Event) => {
      const status = (e as CustomEvent<{ status?: string }>).detail?.status;
      if (status === 'failed') onArUnavailable?.();
    };
    el.addEventListener('ar-status', onStatus);
    return () => el.removeEventListener('ar-status', onStatus);
  }, [onArUnavailable]);

  return (
    <model-viewer
      ref={ref}
      src={glbUrl}
      {...(usdzUrl ? { 'ios-src': usdzUrl } : {})}
      alt={alt}
      ar
      ar-modes="webxr scene-viewer quick-look"
      ar-scale="fixed"
      camera-controls
      touch-action="pan-y"
      shadow-intensity="1"
      exposure="1"
      className="block h-[420px] w-full rounded-xl bg-sunken"
    >
      <button slot="ar-button" className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-lg bg-accent px-5 py-2.5 text-[15px] font-semibold text-on-accent shadow-lg">
        {arButtonLabel}
      </button>
    </model-viewer>
  );
}

export default RoomViewer;
