"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import styles from "./host.module.css";

const WIDTH = 1920;
const HEIGHT = 1080;

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const getScale = () => Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);

/**
 * O telão é desenhado em 1920×1080 (medidas exatas do design) e escalado para
 * caber em qualquer projetor ou janela, sem distorcer.
 */
export function ScreenStage({ children }: { children: ReactNode }) {
  const scale = useSyncExternalStore(subscribe, getScale, () => 0.5);
  return (
    <div className={styles.viewport}>
      <div className={styles.stage} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
