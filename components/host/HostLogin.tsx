"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cx, Deco } from "@/components/ui";
import { BrandSymbol } from "@/components/ui/BrandLogo";
import { ApiRequestError, postJson } from "@/lib/client/api";
import { ScreenStage } from "./ScreenStage";
import styles from "./host.module.css";

const INK = "var(--color-ink)";

/** Senha do apresentador (HOST_PASSWORD) e criação da sessão num só passo. */
export function HostLogin({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (!authenticated) await postJson("/api/host/login", { password });
      const { sessionId } = await postJson<{ sessionId: string }>("/api/host/sessions", {});
      router.push(`/host/${sessionId}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Algo deu errado. Tente de novo.");
      setSubmitting(false);
    }
  }

  return (
    <ScreenStage>
      <div className={cx(styles.screen, styles.onBrand, styles.login)}>
        <Deco
          position={0}
          size={420}
          fill="none"
          stroke={INK}
          strokeWidth={0.5}
          left={-110}
          top={-120}
          rotate={-14}
        />
        <Deco position={2} size={360} fill={INK} right={-90} bottom={-110} />
        <Deco
          position={3}
          size={220}
          fill="var(--color-paper)"
          stroke={INK}
          strokeWidth={0.7}
          right={140}
          top={70}
          rotate={12}
        />
        <Deco
          position={1}
          size={200}
          fill="var(--color-brand-soft)"
          stroke={INK}
          strokeWidth={0.7}
          left={120}
          bottom={60}
        />

        <div className={cx(styles.loginIntro, styles.above)}>
          <BrandSymbol height={72} className={styles.brandSymbol} priority />
          <span className={styles.kicker}>Quiz ao vivo</span>
          <h1 className={styles.loginTitle}>Programa Periódico de Qualidade</h1>
          <p className={styles.loginLead}>
            Área do apresentador. Aqui você cria a sessão e comanda o telão.
          </p>
        </div>

        <form className={cx(styles.loginCard, styles.above)} onSubmit={onSubmit}>
          <h2 className={styles.loginCardTitle}>Entrar como apresentador</h2>
          {error && (
            <div className={styles.loginError} role="alert">
              {error}
            </div>
          )}
          {!authenticated && (
            <div className={styles.loginField}>
              <label htmlFor="host-pass" className={styles.loginLabel}>
                Senha
              </label>
              <input
                id="host-pass"
                type="password"
                className={styles.loginInput}
                placeholder="Digite a senha"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}
          <button type="submit" className={styles.loginSubmit} disabled={submitting}>
            {submitting ? "Criando…" : "Criar sessão"}
          </button>
          <p className={styles.loginNote}>
            A sessão nasce com um PIN de 6 dígitos e um QR code para a plateia.
          </p>
        </form>
      </div>
    </ScreenStage>
  );
}
