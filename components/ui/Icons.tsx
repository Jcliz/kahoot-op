/** Ícones SVG de traço do design. Sempre decorativos: o texto ou o aria-label do botão descreve a ação. */

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Stroke({
  size = 24,
  className,
  strokeWidth = 3,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Stroke strokeWidth={3.5} {...p}>
    <path d="M4 12l5 5L20 6" />
  </Stroke>
);

export const CloseIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Stroke>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 20V5M5 11l7-7 7 7" />
  </Stroke>
);

export const FullscreenIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.5} {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Stroke>
);

export const DownloadIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.8} {...p}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </Stroke>
);

export const ImageIcon = (p: IconProps) => (
  <Stroke strokeWidth={2} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 18l5-5 4 4 3-3 4 4" />
  </Stroke>
);

export const ExitIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.6} {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h10" />
  </Stroke>
);

export const AlertIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.6} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.5" />
  </Stroke>
);

export function PlayIcon({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M7 4l13 8-13 8z" fill="currentColor" />
    </svg>
  );
}

export function CrownIcon({ width, label = "Coroa" }: { width: number; label?: string }) {
  return (
    <svg width={width} height={(width * 24) / 30} viewBox="0 0 30 24" role="img" aria-label={label}>
      <path d="M2 20 1 6l8 6 6-10 6 10 8-6-1 14z" fill="currentColor" />
    </svg>
  );
}

export const SoundOnIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.5} {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </Stroke>
);

export const SoundOffIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.5} {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 9l5 6M22 9l-5 6" />
  </Stroke>
);
