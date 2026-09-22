import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const IconLogo = (p: IconProps) => (
  <Icon {...p} viewBox="0 0 28 28" strokeWidth={2}>
    <rect x="4" y="4" width="20" height="20" rx="3" />
    <path d="M4 11h20M4 18h20" />
  </Icon>
);
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.2 13.2L17 17" />
  </Icon>
);
export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="3.5" />
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
  </Icon>
);
export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 12.5A6.5 6.5 0 017.5 4a6.5 6.5 0 108.5 8.5z" />
  </Icon>
);
export const IconMonitor = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
    <path d="M7 17h6M10 13.5V17" />
  </Icon>
);
export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8h7a4 4 0 010 8H8" />
    <path d="M8 5L5 8l3 3" />
  </Icon>
);
export const IconRedo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 8H8a4 4 0 000 8h4" />
    <path d="M12 5l3 3-3 3" />
  </Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.5l3.5 3.5L16 5.5" />
  </Icon>
);
export const IconCheckCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="8" />
    <path d="M6 10.5l2.5 2.5L14 7.5" />
  </Icon>
);
export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.5l8 14H2z" />
    <path d="M10 8v3.5M10 14.2v.3" />
  </Icon>
);
export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Icon>
);
export const IconXCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="8" />
    <path d="M7 7l6 6M13 7l-6 6" />
  </Icon>
);
export const IconHelpCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="8" />
    <path d="M7.8 7.8a2.3 2.3 0 114 1.6c-.8.6-1.8 1.1-1.8 2.3M10 14.3v.2" />
  </Icon>
);
export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.5 4.5L7 10l5.5 5.5" />
  </Icon>
);
export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7.5l5 5 5-5" />
  </Icon>
);
export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);
export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10h12" />
  </Icon>
);
export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3l7.5 4L10 11 2.5 7z" />
    <path d="M2.5 10.5L10 14.5l7.5-4M2.5 14L10 18l7.5-4" />
  </Icon>
);
export const IconPanel = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
    <path d="M8 3.5v13" />
  </Icon>
);
export const IconFrame = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
  </Icon>
);
export const IconFolder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 6.5a1.5 1.5 0 011.5-1.5h3.5l2 2H16a1.5 1.5 0 011.5 1.5v6.5A1.5 1.5 0 0116 16.5H4a1.5 1.5 0 01-1.5-1.5z" />
  </Icon>
);
export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3v10M6 9l4 4 4-4M3.5 16.5h13" />
  </Icon>
);
export const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.5 17a6.5 6.5 0 0113 0" />
  </Icon>
);
export const IconGlobe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M2.5 10h15M10 2.5c2 2.2 3 4.7 3 7.5s-1 5.3-3 7.5c-2-2.2-3-4.7-3-7.5s1-5.3 3-7.5z" />
  </Icon>
);
export const IconSparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.5l1.6 4.9 4.9 1.6-4.9 1.6L10 15.5l-1.6-4.9-4.9-1.6 4.9-1.6z" />
  </Icon>
);
export const IconSquares = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="2.5" width="6.5" height="6.5" />
    <rect x="11" y="2.5" width="6.5" height="6.5" />
    <rect x="2.5" y="11" width="6.5" height="6.5" />
    <rect x="11" y="11" width="6.5" height="6.5" />
  </Icon>
);
export const IconRuler = (p: IconProps) => (
  <Icon {...p} viewBox="0 0 28 28" strokeWidth={2}>
    <path d="M3 24h22M3 24V6M25 24V6" />
    <path d="M6 12h16M6 10v4M22 10v4" />
  </Icon>
);

/** Line drawings for the furniture gallery; sized by the parent via width/height. */
export function FurnitureArt({ kind, className }: { kind: string; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinejoin: 'round' as const, className };
  switch (kind) {
    case 'open_shelf':
      return (
        <svg viewBox="0 0 96 140" width={80} height={118} {...common} aria-hidden>
          <rect x="6" y="4" width="84" height="132" />
          <path d="M6 36h84M6 68h84M6 100h84" />
        </svg>
      );
    case 'floor_bed':
      return (
        <svg viewBox="0 0 150 110" width={150} height={110} {...common} aria-hidden>
          <path d="M20 100V48L75 8l55 40v52" />
          <path d="M6 100h138" />
          <rect x="24" y="84" width="102" height="12" />
        </svg>
      );
    case 'wall_shelf':
      return (
        <svg viewBox="0 0 150 90" width={150} height={90} {...common} aria-hidden>
          <path d="M10 4v82" opacity={0.35} />
          <rect x="14" y="30" width="126" height="10" />
          <path d="M34 40v22l-16-22M120 40v22l16-22" />
        </svg>
      );
    case 'cabinet_shelf':
      return (
        <svg viewBox="0 0 110 140" width={96} height={118} {...common} aria-hidden>
          <rect x="6" y="4" width="98" height="132" opacity={0.35} />
          <rect x="12" y="62" width="86" height="8" />
        </svg>
      );
    case 'tv_unit':
      return (
        <svg viewBox="0 0 170 70" width={170} height={70} {...common} aria-hidden>
          <rect x="4" y="6" width="162" height="52" />
          <path d="M58 6v52M112 6v52M4 32h54M14 58v8M156 58v8" />
        </svg>
      );
    case 'cube_organizer':
      return (
        <svg viewBox="0 0 120 120" width={106} height={106} {...common} aria-hidden>
          <rect x="4" y="4" width="112" height="112" />
          <path d="M41 4v112M79 4v112M4 41h112M4 79h112" />
        </svg>
      );
    case 'bench':
      return (
        <svg viewBox="0 0 160 70" width={160} height={70} {...common} aria-hidden>
          <rect x="4" y="10" width="152" height="10" />
          <path d="M14 20v44M146 20v44M14 44h132" />
        </svg>
      );
    case 'bed':
      return (
        <svg viewBox="0 0 160 90" width={160} height={90} {...common} aria-hidden>
          <path d="M8 84V14h26v70" />
          <rect x="8" y="54" width="146" height="30" />
          <rect x="34" y="44" width="116" height="10" />
          <rect x="42" y="30" width="30" height="14" rx="4" />
          <rect x="78" y="30" width="30" height="14" rx="4" />
        </svg>
      );
    case 'shoe_cabinet':
    case 'cabinet_doors':
      return (
        <svg viewBox="0 0 110 140" width={96} height={122} {...common} aria-hidden>
          <rect x="6" y="4" width="98" height="126" />
          <path d="M55 4v126M46 60v16M64 60v16M14 130v6M96 130v6" />
        </svg>
      );
    case 'shoe_rack':
      return (
        <svg viewBox="0 0 150 80" width={150} height={80} {...common} aria-hidden>
          <rect x="6" y="6" width="138" height="68" />
          <path d="M6 40h138M24 34l14-6h10v6M84 68l14-6h10v6" />
        </svg>
      );
    case 'desk':
      return (
        <svg viewBox="0 0 160 100" width={160} height={100} {...common} aria-hidden>
          <rect x="4" y="14" width="152" height="10" />
          <path d="M14 24v70M146 24v70M14 44h132" />
        </svg>
      );
    case 'coffee_table':
      return (
        <svg viewBox="0 0 160 70" width={160} height={70} {...common} aria-hidden>
          <rect x="4" y="12" width="152" height="10" />
          <path d="M14 22v42M146 22v42M14 50h132" />
        </svg>
      );
    case 'nightstand':
      return (
        <svg viewBox="0 0 100 110" width={90} height={100} {...common} aria-hidden>
          <rect x="6" y="6" width="88" height="98" />
          <path d="M6 54h88M44 30h12" />
        </svg>
      );
    case 'chair':
    case 'kids_chair':
      return (
        <svg viewBox="0 0 100 140" width={kind === 'kids_chair' ? 70 : 88} height={kind === 'kids_chair' ? 98 : 123} {...common} aria-hidden>
          <path d="M20 134V8h60v126" />
          <path d="M20 76h60M28 76V14" />
        </svg>
      );
    case 'pullup':
      return (
        <svg viewBox="0 0 130 150" width={110} height={127} {...common} aria-hidden>
          <path d="M20 144V10M110 144V10M4 144h32M94 144h32M20 12h90" />
          <path d="M10 30h110" strokeWidth={5} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 96 140" width={80} height={118} {...common} aria-hidden>
          <rect x="6" y="4" width="84" height="132" />
          <path d="M48 4v132M40 64v14M56 64v14" />
        </svg>
      );
  }
}
