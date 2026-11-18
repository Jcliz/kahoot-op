import type { ButtonHTMLAttributes, ReactNode } from "react";
import { formatPoints, ordinal } from "@/lib/client/format";
import type { OptionPosition } from "@/lib/game/types";
import { Shape } from "./Shape";
import styles from "./ui.module.css";

export { Deco, Shape, ShapeRow, SHAPE_NAMES } from "./Shape";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");
export { cx };

// ------------------------------------------------------------------- Pill

export function Pill({
  tone = "dark",
  className,
  children,
}: {
  tone?: "dark" | "light" | "brand";
  className?: string;
  children: ReactNode;
}) {
  const toneClass = { dark: styles.pillDark, light: styles.pillLight, brand: styles.pillBrand }[
    tone
  ];
  return <span className={cx(styles.pill, toneClass, className)}>{children}</span>;
}

// ------------------------------------------------------------------- Alternativas

type TileVariant = "phone" | "web" | "screen" | "result";

const TILE_VARIANT: Record<TileVariant, string> = {
  phone: styles.tilePhone,
  web: styles.tileWeb,
  screen: styles.tileScreen,
  result: styles.tileResult,
};

const TILE_SHAPE_SIZE: Record<TileVariant, number> = { phone: 40, web: 56, screen: 84, result: 60 };

interface AnswerTileProps {
  position: OptionPosition;
  text: string;
  variant: TileVariant;
  /** Só no resultado do telão. */
  correct?: boolean;
}

/** Alternativa identificada por forma E cor, nunca só pela cor. */
export function AnswerTile({ position, text, variant, correct }: AnswerTileProps) {
  return (
    <div
      className={cx(styles.tile, TILE_VARIANT[variant])}
      data-position={position}
      data-correct={correct === undefined ? undefined : String(correct)}
    >
      <Shape
        position={position}
        size={TILE_SHAPE_SIZE[variant]}
        fill="var(--tile-shape)"
        className={styles.tileShape}
      />
      <span>{text}</span>
    </div>
  );
}

/** Versão clicável (celular e web). */
export function AnswerButton({
  position,
  text,
  variant,
  ...buttonProps
}: Omit<AnswerTileProps, "correct" | "variant"> & {
  variant: "phone" | "web";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(styles.tile, TILE_VARIANT[variant])}
      data-position={position}
      {...buttonProps}
    >
      <Shape
        position={position}
        size={TILE_SHAPE_SIZE[variant]}
        fill="var(--tile-shape)"
        className={styles.tileShape}
      />
      <span>{text}</span>
    </button>
  );
}

// ------------------------------------------------------------------- Botões

export function PhoneButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cx(styles.button, styles.buttonPhone, className)} {...props}>
      {children}
    </button>
  );
}

export const phoneButtonClass = cx(styles.button, styles.buttonPhone);

// ------------------------------------------------------------------- Cartões

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className={styles.statGrid}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  outlined = false,
}: {
  label: string;
  value: string;
  hint?: string;
  outlined?: boolean;
}) {
  return (
    <div className={cx(styles.statCard, outlined && styles.statCardOutlined)}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </div>
  );
}

export function PositionBadge({
  rank,
  total,
  surface,
}: {
  rank: number;
  total: number;
  surface: "paper" | "ink";
}) {
  return (
    <div
      className={cx(
        styles.positionBadge,
        surface === "paper" ? styles.positionBadgeOnPaper : styles.positionBadgeOnInk,
      )}
    >
      <span className={styles.positionNumber}>{ordinal(rank)}</span>
      <span className={styles.positionTotal}>de {total}</span>
    </div>
  );
}

export const pointsLabel = (points: number) =>
  `${formatPoints(points)} ${Math.abs(points) === 1 ? "ponto" : "pontos"}`;

// ------------------------------------------------------------------- Cronômetro

export function TimerPill({ seconds }: { seconds: number }) {
  return (
    <span className={styles.timerPill} role="timer" aria-label={`${seconds} segundos`}>
      <span className={styles.timerValue}>{seconds}</span>
      <span className={styles.timerUnit}>s</span>
    </span>
  );
}

export function ProgressBar({
  fraction,
  surface = "paper",
  className,
}: {
  fraction: number;
  /** Sobre preto o trilho fica cinza escuro, para o amarelo ter contraste. */
  surface?: "paper" | "ink";
  className?: string;
}) {
  const percent = Math.min(Math.max(fraction, 0), 1) * 100;
  return (
    <div
      className={cx(styles.progress, surface === "ink" && styles.progressOnInk, className)}
      aria-hidden="true"
    >
      <div className={styles.progressFill} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function WaitingDots() {
  return (
    <div className={styles.dots} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
