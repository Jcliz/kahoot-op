"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import styles from "./host.module.css";

/** Medidas de referência do design. */
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

// Snapshot primitivo (string) para o useSyncExternalStore não re-renderizar à toa.
const getViewport = () => `${window.innerWidth}x${window.innerHeight}`;
const getServerViewport = () => `${BASE_WIDTH}x${BASE_HEIGHT}`;

/**
 * O telão é desenhado em 1920×1080 e escalado pela menor dimensão da janela,
 * para o texto manter o tamanho relativo do design. A outra dimensão se estica
 * até a borda (ex.: 2026×1080 numa janela mais larga que 16:9), então a tela
 * fica sempre preenchida, sem faixas pretas e sem rolagem.
 */
export function ScreenStage({ children }: { children: ReactNode }) {
  const [width, height] = useSyncExternalStore(subscribe, getViewport, getServerViewport)
    .split("x")
    .map(Number);
  const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

  return (
    <div className={styles.viewport}>
      <div
        className={styles.stage}
        style={{
          width: width / scale,
          height: height / scale,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
