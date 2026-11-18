import type { CSSProperties } from "react";
import type { OptionPosition } from "@/lib/game/types";

export const SHAPE_NAMES = ["Triângulo", "Losango", "Círculo", "Quadrado"] as const;

interface ShapeProps {
  /** 0 triângulo, 1 losango, 2 círculo, 3 quadrado. */
  position: OptionPosition;
  size: number;
  /** Cor de preenchimento; use um token, ex.: "var(--color-ink)". Padrão: currentColor. */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Decoração: some para leitores de tela. Caso contrário recebe o nome da forma. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Shape({
  position,
  size,
  fill = "currentColor",
  stroke,
  strokeWidth,
  decorative = false,
  className,
  style,
}: ShapeProps) {
  // Pintura via style (e não atributo) para aceitar tokens CSS como var(--color-ink).
  const paint = { style: { fill, stroke, strokeWidth } };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": SHAPE_NAMES[position] })}
    >
      {position === 0 && <path d="M12 3 22 21H2Z" {...paint} />}
      {position === 1 && <path d="M12 2 22 12 12 22 2 12Z" {...paint} />}
      {position === 2 && <circle cx="12" cy="12" r="10" {...paint} />}
      {position === 3 && <rect x="3" y="3" width="18" height="18" rx="2" {...paint} />}
    </svg>
  );
}

interface DecoProps extends Omit<ShapeProps, "decorative" | "style"> {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  rotate?: number;
}

/** Forma decorativa posicionada de forma absoluta, como nas telas do design. */
export function Deco({ top, right, bottom, left, rotate, ...shape }: DecoProps) {
  return (
    <Shape
      {...shape}
      decorative
      style={{
        position: "absolute",
        top,
        right,
        bottom,
        left,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        pointerEvents: "none",
      }}
    />
  );
}

/** As quatro formas lado a lado (rodapé da entrada, cabeçalho do lobby). */
export function ShapeRow({ size, fill }: { size: number; fill?: string }) {
  return (
    <>
      {([0, 1, 2, 3] as const).map((p) => (
        <Shape key={p} position={p} size={size} fill={fill} decorative />
      ))}
    </>
  );
}
