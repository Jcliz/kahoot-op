/**
 * Telas do participante. Recebem tudo por props e não sabem de Supabase nem de
 * rede, para o design poder mudar sem tocar na lógica.
 */
import Link from "next/link";
import { CheckIcon, CloseIcon, CrownIcon, ArrowUpIcon, ExitIcon } from "@/components/ui/Icons";
import {
  AnswerButton,
  cx,
  Deco,
  Pill,
  PositionBadge,
  ProgressBar,
  Shape,
  StatCard,
  StatGrid,
  TimerPill,
  WaitingDots,
  phoneButtonClass,
  pointsLabel,
} from "@/components/ui";
import { formatPoints, ordinal } from "@/lib/client/format";
import type { OptionPosition, PublicQuestion } from "@/lib/game/types";
import styles from "./player.module.css";

const INK = "var(--color-ink)";
const PAPER = "var(--color-paper)";
const BRAND = "var(--color-brand)";
const BRAND_SOFT = "var(--color-brand-soft)";

const progressLabel = (position: number, total: number) => `${position} de ${total}`;

function TopBar({ pill, nickname, tone }: { pill: string; nickname: string; tone?: "light" }) {
  return (
    <div className={styles.topBar}>
      <Pill tone={tone ?? "dark"}>{pill}</Pill>
      <span className={styles.nickname}>{nickname}</span>
    </div>
  );
}

// ------------------------------------------------------------------- Lobby

export function LobbyView({ nickname }: { nickname: string }) {
  return (
    <main className={cx(styles.screen, styles.onBrand)}>
      <Deco
        position={0}
        size={170}
        fill="none"
        stroke={INK}
        strokeWidth={1}
        left={-60}
        top={-40}
        rotate={-12}
      />
      <Deco position={3} size={140} fill={INK} right={-50} bottom={-40} rotate={14} />
      <div className={cx(styles.column, styles.centered)} style={{ gap: 32 }}>
        <Pill className={styles.above}>
          <CheckIcon size={20} className={styles.brandIcon} />
          Você entrou
        </Pill>
        <div className={styles.grow} style={{ flexGrow: 0, gap: 14 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Seu apelido no telão</span>
          <div className={styles.nicknameCard}>
            <span className={styles.nicknameBig}>{nickname}</span>
          </div>
        </div>
        <div className={styles.grow} style={{ flexGrow: 0, gap: 16 }}>
          <WaitingDots />
          <p className={styles.waitingTitle}>Aguardando o apresentador começar</p>
          <p className={styles.waitingText}>
            Pode deixar a tela aberta. Se ela apagar, é só voltar: seu lugar fica guardado.
          </p>
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Prepare-se

/**
 * Tempo de leitura: só o enunciado, sem alternativas, para pensar antes de responder.
 * O cronômetro de resposta só começa quando as alternativas aparecem.
 */
export function PrepareView({
  question,
  total,
  fractionLeft,
}: {
  question: PublicQuestion;
  total: number;
  fractionLeft: number;
}) {
  return (
    <main className={cx(styles.screen, styles.onInk, styles.prepare)}>
      {/* Só decorações no topo: embaixo ficam o aviso e a barra de tempo. */}
      <Deco position={0} size={130} fill={BRAND} left={-36} top={30} rotate={-16} />
      <Deco position={2} size={110} fill={PAPER} right={-30} top={64} />
      <div className={cx(styles.column, styles.prepareColumn)}>
        <Pill tone="brand" className={styles.above}>
          Pergunta {progressLabel(question.position, total)}
        </Pill>
        <div key={question.id} className={styles.prepareBody}>
          <span className={styles.prepareKicker}>Prepare-se!</span>
          <h1
            className={cx(
              styles.prepareQuestion,
              question.text.length > 80 && styles.prepareQuestionLong,
            )}
          >
            {question.text}
          </h1>
        </div>
        <div className={styles.prepareFooter}>
          <span>As alternativas aparecem em instantes</span>
          <ProgressBar fraction={fractionLeft} surface="ink" />
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Pergunta

interface QuestionViewProps {
  question: PublicQuestion;
  total: number;
  secondsLeft: number;
  fractionLeft: number;
  disabled: boolean;
  error: string | null;
  onAnswer: (optionId: string, position: OptionPosition) => void;
}

/**
 * Pergunta no celular: sem rolagem e sem GIF (economiza dados), só número, tempo,
 * enunciado e os 4 botões. No computador o participante vê a tela do telão (PlayerGame).
 */
export function QuestionView({
  question,
  total,
  secondsLeft,
  fractionLeft,
  disabled,
  error,
  onAnswer,
}: QuestionViewProps) {
  return (
    <main className={cx(styles.screen, styles.question, styles.onPaper, styles.fixedHeight)}>
      <div className={styles.questionHeader}>
        <div className={styles.topBar}>
          <Pill>{progressLabel(question.position, total)}</Pill>
          <TimerPill seconds={secondsLeft} />
        </div>
        <ProgressBar fraction={fractionLeft} />
      </div>
      <h1 className={cx(styles.questionText, question.text.length > 80 && styles.questionTextLong)}>
        {question.text}
      </h1>
      {error && <p className={styles.inlineError}>{error}</p>}
      <div className={styles.options}>
        {question.options.map((o) => (
          <AnswerButton
            key={o.id}
            position={o.position}
            text={o.text}
            variant="phone"
            disabled={disabled}
            onClick={() => onAnswer(o.id, o.position)}
          />
        ))}
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Resposta enviada

export function AnswerSentView({
  position,
  total,
  nickname,
  optionPosition,
  optionText,
}: {
  position: number;
  total: number;
  nickname: string;
  optionPosition: OptionPosition;
  optionText: string;
}) {
  return (
    <main className={cx(styles.screen, styles.onBrand)} style={{ gap: 28, paddingBottom: 40 }}>
      <div className={styles.column}>
        <TopBar pill={progressLabel(position, total)} nickname={nickname} />
        <div className={styles.grow} style={{ gap: 28 }}>
          <h1 className={styles.title}>Resposta enviada!</h1>
          <div className={styles.sentCard}>
            <Shape position={optionPosition} size={130} fill={INK} />
            <span className={styles.sentText}>{optionText}</span>
          </div>
          <p className={styles.lead}>
            Agora não dá mais para trocar. O resultado aparece quando a pergunta fechar.
          </p>
        </div>
        <WaitingDots />
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Acertou / errou

interface ResultViewProps {
  position: number;
  total: number;
  nickname: string;
  correct: boolean;
  answered: boolean;
  points: number;
  score: number;
  rank: number;
  totalPlayers: number;
}

export function ResultView({
  position,
  total,
  nickname,
  correct,
  answered,
  points,
  score,
  rank,
  totalPlayers,
}: ResultViewProps) {
  const stats = (
    <StatGrid>
      <StatCard label="Total" value={formatPoints(score)} hint="pontos" outlined={correct} />
      <StatCard
        label="Posição"
        value={ordinal(rank)}
        hint={`de ${totalPlayers}`}
        outlined={correct}
      />
    </StatGrid>
  );

  if (correct) {
    return (
      <main className={cx(styles.screen, styles.onBrand)}>
        <Deco
          position={0}
          size={60}
          fill={PAPER}
          stroke={INK}
          strokeWidth={1.6}
          left={26}
          top={130}
          rotate={-20}
        />
        <Deco position={3} size={46} fill={INK} right={34} top={120} rotate={14} />
        <Deco
          position={2}
          size={40}
          fill={PAPER}
          stroke={INK}
          strokeWidth={1.8}
          right={60}
          top={270}
        />
        <Deco
          position={1}
          size={44}
          fill={BRAND_SOFT}
          stroke={INK}
          strokeWidth={1.8}
          left={48}
          top={280}
          rotate={10}
        />
        <div className={styles.column}>
          <TopBar pill={progressLabel(position, total)} nickname={nickname} />
          <div className={styles.grow} style={{ gap: 18 }}>
            <div className={cx(styles.resultIcon, styles.resultIconCorrect)}>
              <CheckIcon size={88} />
              <span className="visually-hidden">Resposta certa</span>
            </div>
            <h1 className={styles.titleXL}>Acertou!</h1>
            <span className={styles.pointsGained}>+{pointsLabel(points)}</span>
          </div>
          {stats}
        </div>
      </main>
    );
  }

  return (
    <main className={cx(styles.screen, styles.onInk)}>
      <div className={styles.column}>
        <TopBar pill={progressLabel(position, total)} nickname={nickname} tone="light" />
        <div className={styles.grow} style={{ gap: 18 }}>
          <div className={cx(styles.resultIcon, styles.resultIconWrong)}>
            <CloseIcon size={80} strokeWidth={3.5} />
            <span className="visually-hidden">Resposta errada</span>
          </div>
          <h1 className={styles.titleXL}>{answered ? "Errou!" : "Tempo esgotado!"}</h1>
          <span className={styles.pointsZero}>+0 pontos</span>
          <p className={styles.consolation}>Acontece. Na próxima você recupera.</p>
        </div>
        {stats}
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Posição parcial

export function StandingView({
  position,
  total,
  nickname,
  rank,
  totalPlayers,
  score,
  ahead,
}: {
  position: number;
  total: number;
  nickname: string;
  rank: number;
  totalPlayers: number;
  score: number;
  ahead: { rank: number; gap: number } | null;
}) {
  return (
    <main className={cx(styles.screen, styles.onPaper)}>
      <div className={styles.column}>
        <TopBar pill={`Depois da ${progressLabel(position, total)}`} nickname={nickname} />
        <div className={styles.grow}>
          <span className={styles.label}>Você está em</span>
          <PositionBadge rank={rank} total={totalPlayers} surface="paper" />
          <span className={styles.scoreLine}>{pointsLabel(score)}</span>
        </div>
        <div className={styles.aheadBox}>
          <ArrowUpIcon size={40} />
          {ahead ? (
            <span>
              Faltam <strong>{pointsLabel(ahead.gap)}</strong> para passar quem está em{" "}
              {ordinal(ahead.rank)}.
            </span>
          ) : (
            <span>
              Você está <strong>na liderança</strong>. Segura essa posição!
            </span>
          )}
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Resultado final

export function FinalView({
  nickname,
  rank,
  totalPlayers,
  score,
  correctCount,
  totalQuestions,
}: {
  nickname: string;
  rank: number;
  totalPlayers: number;
  score: number;
  correctCount: number;
  totalQuestions: number;
}) {
  return (
    <main className={cx(styles.screen, styles.onInk)}>
      <div className={styles.column}>
        <Pill tone="brand">Fim de jogo</Pill>
        <div className={styles.grow}>
          <span className={styles.label}>Você terminou em</span>
          <PositionBadge rank={rank} total={totalPlayers} surface="ink" />
          <p className={styles.thanks}>Valeu por jogar, {nickname}!</p>
        </div>
        <StatGrid>
          <StatCard label="Pontos" value={formatPoints(score)} />
          <StatCard label="Acertos" value={`${correctCount} de ${totalQuestions}`} />
        </StatGrid>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Pódio top 3

export function PodiumTop3View({
  nickname,
  rank,
  score,
  correctCount,
  totalQuestions,
}: {
  nickname: string;
  rank: 1 | 2 | 3;
  score: number;
  correctCount: number;
  totalQuestions: number;
}) {
  // Ordem clássica do pódio: 2º, 1º, 3º.
  const places = [2, 1, 3] as const;
  return (
    <main className={cx(styles.screen, styles.onBrand, styles.podiumScreen)}>
      <Deco position={0} size={54} fill={INK} left={22} top={96} rotate={-20} />
      <Deco
        position={3}
        size={44}
        fill={PAPER}
        stroke={INK}
        strokeWidth={1.8}
        right={26}
        top={86}
        rotate={14}
      />
      <Deco
        position={2}
        size={38}
        fill={PAPER}
        stroke={INK}
        strokeWidth={1.8}
        left={34}
        top={330}
      />
      <Deco
        position={1}
        size={46}
        fill={BRAND_SOFT}
        stroke={INK}
        strokeWidth={1.8}
        right={30}
        top={320}
        rotate={10}
      />
      <div className={styles.column} style={{ gap: 20 }}>
        <Pill className={styles.above}>Você está no pódio!</Pill>
        <div className={styles.podiumHero}>
          <CrownIcon width={96} />
          <h1 className={styles.podiumName}>{nickname}</h1>
          <span className={styles.podiumStats}>
            {pointsLabel(score)} · {correctCount} de {totalQuestions} acertos
          </span>
        </div>
        <div className={styles.podiumBlocks}>
          {places.map((place, index) => {
            const mine = place === rank;
            return (
              <div
                key={place}
                data-place={place}
                className={cx(styles.podiumBlock, mine && styles.podiumBlockMine)}
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <span className={styles.podiumPlace}>{ordinal(place)}</span>
                {mine && (
                  <>
                    <span className={styles.podiumPlaceWord}>lugar</span>
                    <span className={styles.podiumYou}>Você</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Aguardando

export function LoadingView({ message }: { message: string }) {
  return (
    <main className={cx(styles.screen, styles.onBrand, styles.centered)} aria-busy="true">
      <div className={cx(styles.column, styles.centered)}>
        <WaitingDots />
        <p className={styles.waitingTitle}>{message}</p>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------- Removido / encerrado

export function ExitView({
  variant,
  onLeave,
}: {
  variant: "kicked" | "ended";
  onLeave: () => void;
}) {
  const copy =
    variant === "kicked"
      ? {
          title: "Você saiu da sala",
          text: "O apresentador removeu seu apelido. Para voltar, entre de novo com outro apelido.",
        }
      : {
          title: "Esse jogo já acabou",
          text: "A sessão foi encerrada. Se tiver um PIN novo, é só entrar de novo.",
        };
  return (
    <main className={cx(styles.screen, styles.onPaper)}>
      <div className={styles.column}>
        <div className={styles.grow} style={{ gap: 24 }}>
          <div className={styles.exitIcon}>
            <ExitIcon size={72} />
          </div>
          <h1 className={styles.exitTitle}>{copy.title}</h1>
          <p className={styles.exitText}>{copy.text}</p>
        </div>
        <Link
          href="/"
          className={cx(phoneButtonClass, styles.stretch)}
          onClick={onLeave}
          style={{ fontSize: 24 }}
        >
          Voltar para a entrada
        </Link>
      </div>
    </main>
  );
}
