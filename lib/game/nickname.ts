export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;

/**
 * Filtro básico de palavrões. A comparação usa a chave normalizada (sem acento,
 * minúscula, números trocados por letras e letras repetidas reduzidas), então
 * pega variações simples como "P0rr4" ou "Merdaaa".
 *
 * BLOCKED_WORDS só bloqueia a palavra inteira, para não barrar nomes legítimos
 * ("computador" contém "puta", "Pintor" contém "pinto").
 * BLOCKED_FRAGMENTS bloqueia em qualquer lugar, inclusive com espaços no meio
 * ("c a r a l h o"); só entram termos sem falsos positivos comuns.
 */
const BLOCKED_WORDS = [
  "cu",
  "pau",
  "fdp",
  "pqp",
  "vsf",
  "tnc",
  "krl",
  "crl",
  "puta",
  "puto",
  "pinto",
  "merda",
  "bosta",
  "foda",
  "foder",
  "fudido",
  "viado",
  "veado",
  "bicha",
  "corno",
  "otario",
  "babaca",
  "cacete",
  "macaco",
  "retardado",
  "piranha",
  "rapariga",
  "vagabundo",
  "vagabunda",
  "cuzao",
  "cuzinho",
  "shit",
  "bitch",
  "dick",
  "pussy",
  "hitler",
  "nazista",
];

const BLOCKED_FRAGMENTS = [
  "porra",
  "caralho",
  "buceta",
  "boceta",
  "piroca",
  "arrombad",
  "punheta",
  "siririca",
  "xoxota",
  "xereca",
  "fodase",
  "filhodaputa",
  "putaria",
  "fuck",
  "nigger",
];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
};

/** Troca números por letras, tira o que não é letra e reduz letras repetidas. */
function squash(text: string): string {
  return [...text]
    .map((ch) => LEET[ch] ?? ch)
    .join("")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
}

const WORD_SET = new Set(BLOCKED_WORDS.map(squash));
const FRAGMENTS = BLOCKED_FRAGMENTS.map(squash);

/** Remove caracteres de controle e espaços extras. */
export function cleanNickname(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave de unicidade: sem acento, minúscula e com espaços normalizados. */
export function nicknameKey(nickname: string): string {
  return cleanNickname(nickname).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function isBlockedNickname(nickname: string): boolean {
  const key = nicknameKey(nickname);
  const words = key.split(/[\s._\-/\\|,;:!?]+/).map(squash);
  if (words.some((w) => WORD_SET.has(w))) return true;
  const joined = squash(key);
  return FRAGMENTS.some((fragment) => joined.includes(fragment));
}

export type NicknameCheck =
  { ok: true; nickname: string; key: string } | { ok: false; reason: "length" | "blocked" };

export function validateNickname(raw: string): NicknameCheck {
  const nickname = cleanNickname(raw);
  const length = [...nickname].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return { ok: false, reason: "length" };
  if (isBlockedNickname(nickname)) return { ok: false, reason: "blocked" };
  return { ok: true, nickname, key: nicknameKey(nickname) };
}
