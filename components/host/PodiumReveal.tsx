"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cx, Shape } from "@/components/ui";
import { CrownIcon, SoundOffIcon, SoundOnIcon } from "@/components/ui/Icons";
import { formatPoints, ordinal } from "@/lib/client/format";
import { loadSoundPreference, PodiumSound, saveSoundPreference } from "@/lib/client/podium-sound";
import type { OptionPosition, RankEntry } from "@/lib/game/types";
import styles from "./podium.module.css";

/**
 * Linha do tempo da revelação (ms desde que o pódio abriu):
 * 3º lugar → 2º lugar → tambores e holofotes procurando o 1º → 1º com confetes.
 */
const TIMELINE = {
  third: 400,
  second: 2_000,
  drumroll: 3_600,
  first: 8_600,
  rankingButton: 10_600,
} as const;

/** Duração dos tambores = a dos holofotes no CSS (5 s). */
const DRUMROLL_MS = TIMELINE.first - TIMELINE.drumroll;

type Step = "waiting" | "third" | "second" | "drumroll" | "first";
const STEP_ORDER: Step[] = ["waiting", "third", "second", "drumroll", "first"];
const reached = (step: Step, target: Step) =>
  STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(target);

interface PodiumRevealProps {
  podium: RankEntry[];
  busy: boolean;
  onShowRanking: () => void;
}

export function PodiumReveal({ podium, busy, onShowRanking }: PodiumRevealProps) {
  const [step, setStep] = useState<Step>("waiting");
  const [showRanking, setShowRanking] = useState(false);
  const [soundOn, setSoundOn] = useState(loadSoundPreference);
  const soundRef = useRef<PodiumSound | null>(null);

  // Avança a sequência no tempo.
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep("third"), TIMELINE.third),
      window.setTimeout(() => setStep("second"), TIMELINE.second),
      window.setTimeout(() => setStep("drumroll"), TIMELINE.drumroll),
      window.setTimeout(() => setStep("first"), TIMELINE.first),
      window.setTimeout(() => setShowRanking(true), TIMELINE.rankingButton),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  // Som: rufar durante a procura e prato na revelação.
  useEffect(() => {
    if (!soundOn) return;
    soundRef.current ??= new PodiumSound();
    if (step === "drumroll") soundRef.current.drumroll(DRUMROLL_MS);
    if (step === "first") soundRef.current.finale();
  }, [step, soundOn]);

  // Para o som ao sair da tela.
  useEffect(() => () => soundRef.current?.stop(), []);

  function toggleSound() {
    const next = !soundOn;
    if (!next) {
      soundRef.current?.stop();
      soundRef.current = null;
    }
    saveSoundPreference(next);
    setSoundOn(next);
  }

  const byPlace = (place: number) => podium.find((e) => e.rank === place);
  const columns = [2, 1, 3].filter((place) => byPlace(place));
  const revealedAt: Record<number, Step> = { 3: "third", 2: "second", 1: "first" };

  return (
    <div className={styles.podium} data-step={step}>
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
            {soundOn ? <SoundOnIcon size={36} /> : <SoundOffIcon size={36} />}
          </button>
          {showRanking && (
            <button type="button" className={styles.button} onClick={onShowRanking} disabled={busy}>
              Ver ranking completo
            </button>
          )}
        </div>
      </header>

      <div className={cx(styles.stage, styles.above)}>
        {columns.map((place) => {
          const entry = byPlace(place)!;
          const revealed = reached(step, revealedAt[place]);
          const searching = place === 1 && step === "drumroll";
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
                    <CrownIcon width={130} />
                  </span>
                  <span
                    className={styles.name}
                    style={
                      {
                        "--winner-size": `${winnerFontSize(entry.nickname)}px`,
                      } as React.CSSProperties
                    }
                  >
                    {entry.nickname}
                  </span>
                  <span className={styles.points}>{formatPoints(entry.score)} pontos</span>
                </div>
              ) : (
                <div className={cx(styles.who, !revealed && styles.hidden)} aria-hidden={!revealed}>
                  <span className={styles.name}>{entry.nickname}</span>
                  <span className={styles.points}>{formatPoints(entry.score)} pontos</span>
                </div>
              )}
              <div className={styles.block} data-place={place}>
                {ordinal(place)}
              </div>
            </div>
          );
        })}
      </div>

      {step === "first" && <Confetti />}
    </div>
  );
}

/** Apelidos longos (até 20 caracteres) diminuem para caber numa linha só, sem quebrar. */
function winnerFontSize(nickname: string): number {
  return Math.min(96, Math.floor(1500 / Math.max([...nickname].length, 1)));
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
function Confetti() {
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
}
