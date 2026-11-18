import QRCode from "qrcode";
import { useMemo } from "react";

const QUIET_ZONE = 1;

/** QR code em SVG puro, pintado com os tokens (sem hex no código). */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.get(y, x)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: modules.size + QUIET_ZONE * 2, path: d };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label="QR code para entrar no jogo"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} style={{ fill: "var(--color-paper)" }} />
      <path d={path} style={{ fill: "var(--color-ink)" }} />
    </svg>
  );
}
