/**
 * Erros de regra de jogo. As rotas convertem cada código em um status HTTP
 * e uma mensagem que pode ir para a tela.
 */
export const GAME_ERRORS = {
  SESSION_NOT_FOUND: { status: 404, message: "PIN não encontrado. Confira os 6 dígitos no telão." },
  SESSION_FINISHED: { status: 410, message: "Esse jogo já acabou." },
  GAME_ALREADY_STARTED: {
    status: 409,
    message: "Esse jogo já começou. Aguarde a próxima rodada.",
  },
  NICKNAME_TAKEN: { status: 409, message: "Já tem alguém com esse apelido. Tente outro." },
  NICKNAME_INVALID: { status: 400, message: "O apelido precisa ter de 2 a 20 caracteres." },
  NICKNAME_BLOCKED: { status: 400, message: "Esse apelido não pode ser usado. Escolha outro." },
  PLAYER_NOT_FOUND: { status: 401, message: "Sua entrada expirou. Entre de novo." },
  PLAYER_KICKED: { status: 403, message: "O apresentador removeu seu apelido." },
  INVALID_TRANSITION: { status: 409, message: "Essa ação não vale na fase atual do jogo." },
  STALE_VERSION: { status: 409, message: "O jogo já mudou de fase. Atualizando…" },
  QUESTION_NOT_OPEN: { status: 409, message: "Essa pergunta não está mais aberta." },
  ANSWER_TOO_LATE: { status: 409, message: "O tempo acabou." },
  ALREADY_ANSWERED: { status: 409, message: "Você já respondeu essa pergunta." },
  OPTION_NOT_FOUND: { status: 400, message: "Alternativa inválida." },
  QUIZ_NOT_FOUND: { status: 500, message: "Nenhum quiz cadastrado. Rode `npm run seed`." },
  PIN_EXHAUSTED: { status: 503, message: "Não foi possível gerar um PIN livre. Tente de novo." },
} as const;

export type GameErrorCode = keyof typeof GAME_ERRORS;

export class GameError extends Error {
  readonly code: GameErrorCode;
  readonly status: number;

  constructor(code: GameErrorCode) {
    super(GAME_ERRORS[code].message);
    this.name = "GameError";
    this.code = code;
    this.status = GAME_ERRORS[code].status;
  }
}
