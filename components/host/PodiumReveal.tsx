"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cx, Shape } from "@/components/ui";
import { CrownIcon, SoundOffIcon, SoundOnIcon } from "@/components/ui/Icons";
import { formatPoints, ordinal } from "@/lib/client/format";
import {
  loadSoundPreference,
  PodiumSound,
  saveSoundPreference,
  type SoundScope,
} from "@/lib/client/podium-sound";
import type { OptionPosition, RankEntry } from "@/lib/game/types";
import styles from "./podium.module.css";

/**
 * Linha do tempo da revelação (ms desde que o pódio abriu no servidor):
 * 3º lugar → 2º lugar → tambores e holofotes procurando o 1º → 1º com confetes.
 */
const TIMELINE = {
  third: 400,
  second: 2_000,
  drumroll: 3_600,
  first: 8_600,
  action: 10_600,
  /** Depois disso os confetes já caíram: não monta mais a chuva. */
  confettiEnd: 18_600,
} as const;

const CUES = [
  TIMELINE.third,
  TIMELINE.second,
  TIMELINE.drumroll,
  TIMELINE.first,
  TIMELINE.action,
  TIMELINE.confettiEnd,
];

type Step = "waiting" | "third" | "second" | "drumroll" | "first";
const STEP_ORDER: Step[] = ["waiting", "third", "second", "drumroll", "first"];
const reached = (step: Step, target: Step) =>
  STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(target);

export type PodiumLayout = "screen" | "phone";

interface PodiumRevealProps {
  podium: RankEntry[];
  /** Quando o pódio abriu, no relógio do servidor: sincroniza telão e celulares. */
  startedAt: number | null;
  /** Diferença servidor − aparelho (useServerClockOffset). */
  offset: number;
  /** "screen": telão 1920×1080 (dentro do ScreenStage). "phone": tela cheia do celular. */
  layout?: PodiumLayout;
  /** Destaca o próprio participante, se ele estiver no pódio. */
  highlightPlayerId?: string;
  /** Botão que aparece no fim da revelação. */
  action: { label: string; onClick: () => void; busy?: boolean };
}

/**
 * Quantas marcas da linha do tempo já passaram. Conta a partir do início no
 * servidor (todos os aparelhos juntos; quem recarrega retoma do ponto certo),
 * mas nunca espera um início "no futuro" por causa de relógio adiantado.
 */
function useCuesReached(startedAt: number | null, offset: number): [number, number] {
  const [mountedAt] = useState(() => Date.now());
  const start = startedAt === null ? mountedAt : Math.min(startedAt - offset, mountedAt);
  const [count, setCount] = useState(() => CUES.filter((at) => mountedAt - start >= at).length);

  useEffect(() => {
    const timers = CUES.map((at, i) =>
      window.setTimeout(
        // só avança: um ajuste do relógio não faz a animação voltar
        () => setCount((c) => Math.max(c, i + 1)),
        Math.max(start + at - Date.now(), 0),
      ),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [start]);

  return [count, start];
}

export function PodiumReveal({
  podium,
  startedAt,
  offset,
  layout = "screen",
  highlightPlayerId,
  action,
}: PodiumRevealProps) {
  const [cues, start] = useCuesReached(startedAt, offset);
  const step: Step = STEP_ORDER[Math.min(cues, STEP_ORDER.length - 1)];
  const showAction = cues >= 5;
  const showConfetti = step === "first" && cues < 6;

  const phone = layout === "phone";
  const scope: SoundScope = phone ? "phone" : "screen";
  const [soundOn, setSoundOn] = useState(() => loadSoundPreference(scope));
  const soundRef = useRef<PodiumSound | null>(null);

  // Som: rufar durante a procura e prato na revelação (não toca o que já passou).
  useEffect(() => {
    if (!soundOn) return;
    soundRef.current ??= new PodiumSound();
    const now = Date.now();
    if (step === "drumroll") {
      const left = start + TIMELINE.first - now;
      if (left > 400) soundRef.current.drumroll(left);
    }
    if (step === "first" && now - (start + TIMELINE.first) < 1_500) soundRef.current.finale();
  }, [step, soundOn, start]);

  // Para o som ao sair da tela.
  useEffect(() => () => soundRef.current?.stop(), []);

  function toggleSound() {
    const next = !soundOn;
    if (!next) {
      soundRef.current?.stop();
      soundRef.current = null;
    }
    saveSoundPreference(scope, next);
    setSoundOn(next);
  }

  const byPlace = (place: number) => podium.find((e) => e.rank === place);
  const columns = [2, 1, 3].filter((place) => byPlace(place));
  const revealedAt: Record<number, Step> = { 3: "third", 2: "second", 1: "first" };
  const iconSize = phone ? 22 : 36;

  return (
    <div className={styles.podium} data-step={step} data-layout={layout}>
      <div className={styles.dim} aria-hidden="true" />
      <div className={styles.floorGlow} aria-hidden="true" />
      <div className={styles.spotlights} aria-hidden="true">
        {(["left", "center", "right"] as const).map((spot) => (
          <span key={spot} className={styles.spot} data-spot={spot} />
        ))}
      </div>

      <header className={cx(styles.header, styles.above)}>
        <h1 className={styles.title}>Pódio</h1>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggleSound}
            aria-label={soundOn ? "Desligar o som" : "Ligar o som"}
            aria-pressed={soundOn}
          >
            {soundOn ? <SoundOnIcon size={iconSize} /> : <SoundOffIcon size={iconSize} />}
          </button>
          {showAction && (
            <button
              type="button"
              className={styles.button}
              onClick={action.onClick}
              disabled={action.busy}
            >
              {action.label}
            </button>
          )}
        </div>
      </header>

      <div className={cx(styles.stage, styles.above)}>
        {columns.map((place) => {
          const entry = byPlace(place)!;
          const revealed = reached(step, revealedAt[place]);
          const searching = place === 1 && step === "drumroll";
          const you = entry.playerId === highlightPlayerId && (
            <span className={styles.you}>Você</span>
          );
          return (
            <div key={place} className={styles.column} data-place={place}>
              {searching ? (
                <DrumRoll />
              ) : place === 1 ? (
                <div
                  className={cx(styles.who, revealed ? styles.winner : styles.hidden)}
                  aria-hidden={!revealed}
                >
                  <span className={styles.crown}>
                    <CrownIcon width={phone ? 64 : 130} />
                  </span>
                  <span
                    className={styles.name}
                    style={
                      {
                        "--winner-size": `${winnerFontSize(entry.nickname, layout)}px`,
                      } as React.CSSProperties
                    }
                  >
                    {entry.nickname}
                  </span>
                  <span className={styles.points}>{formatPoints(entry.score)} pontos</span>
                  {you}
                </div>
              ) : (
                <div className={cx(styles.who, !revealed && styles.hidden)} aria-hidden={!revealed}>
                  <span className={styles.name}>{entry.nickname}</span>
                  <span className={styles.points}>{formatPoints(entry.score)} pontos</span>
                  {you}
                </div>
              )}
              <div className={styles.block} data-place={place}>
                {ordinal(place)}
              </div>
            </div>
          );
        })}
      </div>

      {showConfetti && <Confetti />}
    </div>
  );
}

/**
 * Apelidos longos (até 20 caracteres) diminuem: no telão cabem numa linha só;
 * no celular a coluna é estreita e o nome pode quebrar.
 */
function winnerFontSize(nickname: string, layout: PodiumLayout): number {
  const length = Math.max([...nickname].length, 1);
  return layout === "phone"
    ? Math.min(30, Math.floor(360 / length))
    : Math.min(96, Math.floor(1500 / length));
}

/** Tambor batendo e o "?" no lugar do vencedor. */
function DrumRoll() {
  return (
    <div className={styles.drumArea} role="status">
      <span className={styles.drumText}>Rufem os tambores…</span>
      <span className={styles.mystery} aria-hidden="true">
        ?
      </span>
      <svg className={styles.drum} viewBox="0 0 120 100" aria-hidden="true">
        <g className={styles.drumBody}>
          <rect x="18" y="40" width="84" height="44" style={{ fill: "var(--color-brand)" }} />
          <path
            d="M18 44 32 80 46 44 60 80 74 44 88 80 102 44"
            style={{ fill: "none", stroke: "var(--color-ink)", strokeWidth: 3 }}
          />
          <ellipse cx="60" cy="84" rx="42" ry="10" style={{ fill: "var(--color-brand-soft)" }} />
          <rect
            x="18"
            y="40"
            width="84"
            height="44"
            style={{ fill: "none", stroke: "var(--color-paper)", strokeWidth: 3 }}
          />
          <ellipse
            cx="60"
            cy="40"
            rx="42"
            ry="10"
            style={{ fill: "var(--color-paper)", stroke: "var(--color-ink)", strokeWidth: 3 }}
          />
        </g>
        <g className={styles.stickLeft}>
          <line
            x1="8"
            y1="6"
            x2="48"
            y2="36"
            style={{ stroke: "var(--color-paper)", strokeWidth: 5, strokeLinecap: "round" }}
          />
          <circle cx="48" cy="36" r="5" style={{ fill: "var(--color-brand)" }} />
        </g>
        <g className={styles.stickRight}>
          <line
            x1="112"
            y1="6"
            x2="72"
            y2="36"
            style={{ stroke: "var(--color-paper)", strokeWidth: 5, strokeLinecap: "round" }}
          />
          <circle cx="72" cy="36" r="5" style={{ fill: "var(--color-brand)" }} />
        </g>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------- Confetes

const CONFETTI_COUNT = 170;
const CONFETTI_COLORS = [
  "var(--color-brand)",
  "var(--color-brand-soft)",
  "var(--color-paper)",
  "var(--color-brand)",
];

/** Gerador pseudoaleatório com semente: confetes variados, render previsível. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chuva de confetes com as 4 formas do jogo, nas cores da marca. */
const Confetti = memo(function Confetti() {
  const pieces = useMemo(() => {
    const random = mulberry32(20261118);
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      shape: Math.floor(random() * 4) as OptionPosition,
      color: CONFETTI_COLORS[Math.floor(random() * CONFETTI_COLORS.length)],
      left: random() * 100,
      size: 18 + random() * 22,
      // três levas, para a chuva durar uns 9 s
      delay: Math.floor((i / CONFETTI_COUNT) * 3) * 1.4 + random() * 1.2,
      duration: 4.5 + random() * 2.5,
      drift: (random() - 0.5) * 360,
      spin: (random() - 0.5) * 1440,
      flutter: 0.35 + random() * 0.5,
    }));
  }, []);

  return (
    <div className={styles.confetti} aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={styles.piece}
          style={
            {
              left: `${p.left}%`,
              "--delay": `${p.delay}s`,
              "--duration": `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
              "--flutter": `${p.flutter}s`,
            } as React.CSSProperties
          }
        >
          <Shape position={p.shape} size={p.size} fill={p.color} decorative />
        </span>
      ))}
    </div>
  );
});
