/**
 * Telas no formato telão (1920×1080). Recebem tudo por props.
 * ScreenIntro e ScreenQuestion também são usadas pelo participante no computador.
 */
import type { ReactNode } from "react";
import { AnswerButton, AnswerTile, cx, Deco } from "@/components/ui";
import { BrandSymbol } from "@/components/ui/BrandLogo";
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  FullscreenIcon,
  PlayIcon,
} from "@/components/ui/Icons";
import { formatPoints, ordinal } from "@/lib/client/format";
import { formatPin } from "@/lib/game/pin";
import type {
  LobbyPlayer,
  OptionPosition,
  PublicQuestion,
  QuestionResults,
  RankEntry,
} from "@/lib/game/types";
import { QrCode } from "./QrCode";
import styles from "./host.module.css";

const INK = "var(--color-ink)";
const PAPER = "var(--color-paper)";
const TITLE = "Programa Periódico de Qualidade";

const progressLabel = (position: number, total: number) => `${position} de ${total}`;

export function FullscreenButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.btnIcon} aria-label="Tela cheia" onClick={onClick}>
      <FullscreenIcon size={36} />
    </button>
  );
}

// ------------------------------------------------------------------- Lobby

interface LobbyProps {
  pin: string;
  joinUrl: string;
  shortUrl: string;
  players: LobbyPlayer[];
  busy: boolean;
  onStart: () => void;
  onKick: (playerId: string) => void;
  onFullscreen: () => void;
}

export function HostLobby({
  pin,
  joinUrl,
  shortUrl,
  players,
  busy,
  onStart,
  onKick,
  onFullscreen,
}: LobbyProps) {
  return (
    <div className={cx(styles.screen, styles.onInk)}>
      <section className={styles.lobbyPanel}>
        <div className={styles.lobbyBrand}>
          <BrandSymbol height={64} priority />
          <span>{TITLE}</span>
        </div>
        <h1 className={styles.lobbyTitle}>Bora jogar?</h1>
        <p className={styles.lobbyHelp}>
          Aponte a câmera para o QR code ou abra <strong>{shortUrl}</strong> no celular.
        </p>
        <div className={styles.lobbyJoinRow}>
          <div className={styles.qrCard}>
            <QrCode value={joinUrl} className={styles.qr} />
            <span>Leia e entre</span>
          </div>
          <div className={styles.pinCard}>
            <span className={styles.pinLabel}>PIN do jogo</span>
            <span className={styles.pinValue}>{formatPin(pin)}</span>
          </div>
        </div>
      </section>

      <section className={styles.lobbyMain}>
        <div className={styles.lobbyTop}>
          <div className={styles.playerCount} aria-live="polite">
            <span className={styles.playerCountNumber}>{players.length}</span>
            <span className={styles.playerCountLabel}>na sala</span>
          </div>
          <div className={styles.controls}>
            <FullscreenButton onClick={onFullscreen} />
            <button
              type="button"
              className={styles.btnPrimaryOnInk}
              onClick={onStart}
              disabled={busy || players.length === 0}
            >
              Iniciar
              <PlayIcon size={40} />
            </button>
          </div>
        </div>
        <ul className={styles.chips} data-dense={players.length > 40}>
          {players.map((p) => (
            <li key={p.id} className={styles.chip}>
              <span>{p.nickname}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remover ${p.nickname}`}
                onClick={() => onKick(p.id)}
              >
                <CloseIcon size={22} />
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.mutedNote}>Toque no X para remover um apelido da sala.</p>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------- Abertura (tempo de leitura)

export function ScreenIntro({
  question,
  total,
  fractionLeft,
  barLabel,
  action,
}: {
  question: PublicQuestion;
  total: number;
  fractionLeft: number;
  barLabel: string;
  /** Ação no canto (telão: "Abrir agora"). */
  action?: ReactNode;
}) {
  return (
    <div className={cx(styles.screen, styles.onBrand, styles.intro)}>
      {/* Baixa a mídia durante o tempo de leitura para ela já aparecer pronta na pergunta. */}
      {question.mediaUrl && (
        <link
          rel="preload"
          href={question.mediaUrl}
          as={/\.(mp4|webm)$/i.test(question.mediaUrl) ? "video" : "image"}
        />
      )}
      <Deco
        position={1}
        size={520}
        fill="none"
        stroke={INK}
        strokeWidth={0.4}
        right={-150}
        top={-170}
        rotate={18}
      />
      <Deco
        position={2}
        size={300}
        fill={PAPER}
        stroke={INK}
        strokeWidth={0.6}
        right={90}
        bottom={-120}
      />
      <div key={question.id} className={styles.introBadge}>
        <span className={styles.introSmall}>Pergunta</span>
        <span className={styles.introNumber}>{question.position}</span>
        <span className={styles.introTotal}>de {total}</span>
      </div>
      <div className={cx(styles.introBody, styles.above)}>
        <h1
          className={cx(
            styles.introQuestion,
            question.text.length > 70 && styles.introQuestionLong,
          )}
        >
          {question.text}
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span className={styles.introBarLabel}>{barLabel}</span>
          <div className={styles.introBar} aria-hidden="true">
            <div
              className={styles.introBarFill}
              style={{ width: `${(1 - fractionLeft) * 100}%` }}
            />
          </div>
        </div>
      </div>
      {action && <div className={styles.introSkip}>{action}</div>}
    </div>
  );
}

export function HostIntroSkip({ busy, onSkip }: { busy: boolean; onSkip: () => void }) {
  return (
    <button type="button" className={styles.btnSecondaryOnBrand} onClick={onSkip} disabled={busy}>
      Abrir agora
    </button>
  );
}

// ------------------------------------------------------------------- Pergunta aberta

interface ScreenQuestionProps {
  question: PublicQuestion;
  total: number;
  secondsLeft: number;
  /** Lado direito do cabeçalho (telão: Finalizar pergunta e tela cheia; jogador: apelido). */
  headerRight: ReactNode;
  /** Abaixo do enunciado (telão: quantos já responderam). */
  belowQuestion?: ReactNode;
  /** Com esta função as alternativas viram botões (participante no computador). */
  onAnswer?: (optionId: string, position: OptionPosition) => void;
  answersDisabled?: boolean;
}

export function ScreenQuestion({
  question,
  total,
  secondsLeft,
  headerRight,
  belowQuestion,
  onAnswer,
  answersDisabled = false,
}: ScreenQuestionProps) {
  return (
    <div className={cx(styles.screen, styles.onInk, styles.questionScreen)}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.counterPill}>{progressLabel(question.position, total)}</span>
          <span className={styles.headerNote}>{TITLE}</span>
        </div>
        {headerRight}
      </header>

      <div className={styles.questionMiddle}>
        <div className={styles.questionBody}>
          <h1
            className={cx(
              styles.questionText,
              question.text.length > 70 && styles.questionTextLong,
            )}
          >
            {question.text}
          </h1>
          {belowQuestion}
        </div>
        {question.mediaUrl && <QuestionMedia src={question.mediaUrl} />}
        <div className={styles.timerCircle} data-urgent={secondsLeft <= 5} role="timer">
          <span className={styles.timerNumber}>{secondsLeft}</span>
          <span>segundos</span>
        </div>
      </div>

      <div className={styles.optionsGrid}>
        {question.options.map((o) =>
          onAnswer ? (
            <AnswerButton
              key={o.id}
              position={o.position}
              text={o.text}
              variant="screen"
              disabled={answersDisabled}
              onClick={() => onAnswer(o.id, o.position)}
            />
          ) : (
            <AnswerTile key={o.id} position={o.position} text={o.text} variant="screen" />
          ),
        )}
      </div>
    </div>
  );
}

/** Controles do apresentador no cabeçalho da pergunta. */
export function HostQuestionControls({
  busy,
  onClose,
  onFullscreen,
}: {
  busy: boolean;
  onClose: () => void;
  onFullscreen: () => void;
}) {
  return (
    <div className={styles.controls}>
      <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={busy}>
        Finalizar pergunta
      </button>
      <FullscreenButton onClick={onFullscreen} />
    </div>
  );
}

/** Quantos já responderam (só no telão). */
export function AnswerProgress({ answered, players }: { answered: number; players: number }) {
  const fraction = players > 0 ? Math.min(answered / players, 1) : 0;
  return (
    <div className={styles.answerProgress} aria-live="polite">
      <div className={styles.answerTrack} aria-hidden="true">
        <div className={styles.answerFill} style={{ width: `${fraction * 100}%` }} />
      </div>
      <span>
        <span className={styles.highlight}>{answered}</span> de {players} responderam
      </span>
    </div>
  );
}

/** Apelido do participante no cabeçalho (no lugar dos controles do apresentador). */
export function NicknameBadge({ nickname }: { nickname: string }) {
  return <span className={styles.nicknameBadge}>{nickname}</span>;
}

/** GIF/imagem em public/media, ou vídeo (MP4/WebM em loop, bem mais leve que GIF). */
function QuestionMedia({ src }: { src: string }) {
  if (/\.(mp4|webm)$/i.test(src)) {
    return (
      <video
        className={styles.media}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- GIF animado: o otimizador do next/image não preserva a animação
  return <img className={styles.media} src={src} alt="" />;
}

// ------------------------------------------------------------------- Resultado

export function HostResults({
  question,
  total,
  results,
  busy,
  isLast,
  onNext,
}: {
  question: PublicQuestion;
  total: number;
  results: QuestionResults;
  busy: boolean;
  isLast: boolean;
  onNext: () => void;
}) {
  const max = Math.max(...results.counts, 1);
  return (
    <div className={cx(styles.screen, styles.onInk, styles.questionScreen)} style={{ gap: 28 }}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.counterPill}>{progressLabel(question.position, total)}</span>
          <span className={styles.headerNote}>
            {results.totalAnswers} {results.totalAnswers === 1 ? "resposta" : "respostas"}
          </span>
        </div>
        <button type="button" className={styles.btnNext} onClick={onNext} disabled={busy}>
          {isLast ? "Ver pódio" : "Próximo"}
          <ArrowRightIcon size={32} />
        </button>
      </header>

      <h1 className={styles.resultsTitle}>{question.text}</h1>

      <div className={styles.resultsGrid}>
        {question.options.map((o, index) => {
          const count = results.counts[o.position];
          const correct = o.position === results.correctPosition;
          return (
            <div key={o.id} className={styles.resultColumn}>
              <div className={styles.resultBarWrap}>
                {correct ? (
                  <div className={styles.correctRow}>
                    <span className={styles.resultCountCorrect}>{count}</span>
                    <span className={styles.correctBadge}>
                      <CheckIcon size={26} />
                      Correta
                    </span>
                  </div>
                ) : (
                  <span className={styles.resultCount}>{count}</span>
                )}
                <div
                  className={cx(styles.resultBar, correct && styles.resultBarCorrect)}
                  style={{
                    height: Math.max((count / max) * 380, 20),
                    animationDelay: `${index * 80}ms`,
                  }}
                  aria-hidden="true"
                />
              </div>
              <AnswerTile position={o.position} text={o.text} variant="result" correct={correct} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- Top 5

export function HostLeaderboard({
  position,
  total,
  top5,
  busy,
  onNext,
}: {
  position: number;
  total: number;
  top5: RankEntry[];
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <div className={cx(styles.screen, styles.onBrand, styles.leaderboard)}>
      <Deco
        position={3}
        size={460}
        fill="none"
        stroke={INK}
        strokeWidth={0.45}
        left={-140}
        bottom={-160}
        rotate={10}
      />
      <div className={cx(styles.leaderboardSide, styles.above)}>
        <span className={styles.sidePill}>Depois da pergunta {progressLabel(position, total)}</span>
        <h1 className={styles.top5Title}>Top 5</h1>
        <p className={styles.sideText}>
          Quem responde certo e rápido sobe. Ainda dá tempo de virar o jogo.
        </p>
        <button
          type="button"
          className={cx(styles.btnPrimaryOnBrand, styles.pushDown)}
          onClick={onNext}
          disabled={busy}
        >
          Próxima pergunta
          <ArrowRightIcon size={36} />
        </button>
      </div>
      <ol className={cx(styles.top5List, styles.above)}>
        {top5.map((entry, index) => (
          <li
            key={entry.playerId}
            className={styles.top5Row}
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <span className={styles.top5Rank}>{ordinal(entry.rank)}</span>
            <span className={styles.top5Name}>{entry.nickname}</span>
            <span className={styles.top5Score}>{formatPoints(entry.score)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------- Ranking completo

export function HostRanking({
  ranking,
  totalQuestions,
  csvHref,
}: {
  ranking: RankEntry[];
  totalQuestions: number;
  csvHref: string;
}) {
  return (
    <div className={cx(styles.screen, styles.onPaper)}>
      <section className={styles.rankingPanel}>
        <BrandSymbol height={64} className={styles.brandSymbol} />
        <span className={styles.sidePill}>Fim de jogo</span>
        <h1 className={styles.rankingTitle}>Ranking completo</h1>
        <p className={styles.rankingLead}>
          {ranking.length} {ranking.length === 1 ? "participante" : "participantes"},{" "}
          {totalQuestions} perguntas. Valeu por jogar!
        </p>
        <div className={styles.rankingExport}>
          <a className={styles.btnPrimaryOnBrand} href={csvHref} download>
            <DownloadIcon size={38} />
            Exportar CSV
          </a>
          <span>Apelido, pontos e acertos por pergunta.</span>
        </div>
      </section>
      <section className={styles.rankingMain}>
        <div className={styles.rankingHead} aria-hidden="true">
          <span className={styles.colRank}>Posição</span>
          <span className={styles.colName}>Apelido</span>
          <span className={styles.colNum}>Acertos</span>
          <span className={styles.colNum}>Pontos</span>
        </div>
        <ol className={styles.rankingList}>
          {ranking.map((entry) => (
            <li key={entry.playerId} className={styles.rankingRow} data-top={entry.rank <= 3}>
              <span className={styles.rankingRank}>{ordinal(entry.rank)}</span>
              <span className={styles.rankingName}>{entry.nickname}</span>
              <span className={styles.rankingCorrect}>
                {entry.correctCount} de {totalQuestions}
              </span>
              <span className={styles.rankingScore}>{formatPoints(entry.score)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------- Carregando

export function HostLoading({ message }: { message: string }) {
  return (
    <div className={cx(styles.screen, styles.onBrand, styles.intro)} aria-busy="true">
      <h1 className={styles.introQuestion}>{message}</h1>
    </div>
  );
}
