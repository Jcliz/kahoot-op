"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AlertIcon, ArrowRightIcon } from "@/components/ui/Icons";
import { cx, Deco, PhoneButton, ShapeRow } from "@/components/ui";
import { ApiRequestError, postJson } from "@/lib/client/api";
import { loadPlayer, savePlayer } from "@/lib/client/player-storage";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/game/nickname";
import { normalizePinInput, PIN_LENGTH } from "@/lib/game/pin";
import type { JoinResponse } from "@/lib/game/types";
import styles from "./player.module.css";

export function JoinForm({ initialPin }: { initialPin: string }) {
  const router = useRouter();
  const [pin, setPin] = useState(normalizePinInput(initialPin));
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Quem já entrou nesta sessão (ou não veio por um QR novo) volta direto para o jogo.
  useEffect(() => {
    const stored = loadPlayer();
    if (stored && (!initialPin || normalizePinInput(initialPin) === stored.pin)) {
      router.replace("/play");
    }
  }, [initialPin, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (pin.length !== PIN_LENGTH) {
      setError("PIN não encontrado. Confira os 6 dígitos no telão.");
      return;
    }
    const trimmed = nickname.trim();
    if (trimmed.length < NICKNAME_MIN) {
      setError(`O apelido precisa ter de ${NICKNAME_MIN} a ${NICKNAME_MAX} caracteres.`);
      return;
    }

    setSubmitting(true);
    try {
      const joined = await postJson<JoinResponse>("/api/join", { pin, nickname: trimmed });
      savePlayer({ ...joined, pin, nickname: trimmed });
      router.push("/play");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Algo deu errado. Tente de novo.");
      setSubmitting(false);
    }
  }

  return (
    <main className={cx(styles.screen, styles.onBrand, styles.join)}>
      <Deco position={1} size={150} fill="var(--color-ink)" right={-44} top={-36} rotate={16} />
      <Deco
        position={2}
        size={70}
        fill="var(--color-paper)"
        stroke="var(--color-ink)"
        strokeWidth={1.4}
        right={84}
        top={34}
      />
      <div className={styles.column} style={{ alignItems: "stretch" }}>
        <div className={styles.above} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className={styles.brandLine}>Programa Periódico de Qualidade</span>
          <h1 className={styles.joinTitle}>Bora jogar?</h1>
        </div>

        <form className={styles.card} onSubmit={onSubmit} noValidate>
          {error && (
            <div className={styles.errorBox} role="alert">
              <AlertIcon size={22} />
              <span>{error}</span>
            </div>
          )}
          <div className={styles.field}>
            <label htmlFor="pin" className={styles.fieldLabel}>
              PIN do jogo
            </label>
            <input
              id="pin"
              name="pin"
              className={styles.inputPin}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={(e) => setPin(normalizePinInput(e.target.value))}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="nickname" className={styles.fieldLabel}>
              Seu apelido
            </label>
            <input
              id="nickname"
              name="nickname"
              className={styles.input}
              type="text"
              maxLength={NICKNAME_MAX}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              placeholder="Como quer aparecer no telão?"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              aria-describedby="nickname-hint"
              required
            />
            <span id="nickname-hint" className={styles.hint}>
              De {NICKNAME_MIN} a {NICKNAME_MAX} caracteres. Sem cadastro, sem senha.
            </span>
          </div>
          <PhoneButton type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
            <ArrowRightIcon size={26} />
          </PhoneButton>
        </form>

        <div className={styles.shapeFooter}>
          <ShapeRow size={26} fill="var(--color-ink)" />
        </div>
      </div>
    </main>
  );
}
