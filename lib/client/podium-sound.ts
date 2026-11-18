/**
 * Som da revelação do pódio, sintetizado com a Web Audio API (sem arquivos de áudio):
 * rufar de tambor que acelera e cresce, e no fim prato + bumbo.
 *
 * O navegador só libera áudio depois de um clique na página; no telão o apresentador
 * já clicou em vários botões antes do pódio. Se o áudio falhar, a animação segue muda.
 */
export class PodiumSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private ensure(): { ctx: AudioContext; master: GainNode; noise: AudioBuffer } | null {
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);

        // 1 s de ruído branco, reaproveitado em todas as batidas
        const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        this.ctx = ctx;
        this.master = master;
        this.noise = noise;
      }
      void this.ctx.resume();
      return { ctx: this.ctx, master: this.master!, noise: this.noise! };
    } catch {
      return null;
    }
  }

  /** Uma batida de caixa no instante `at` (relógio do AudioContext). */
  private snare(at: number, peak: number) {
    const audio = this.ensure();
    if (!audio) return;
    const { ctx, master, noise } = audio;

    const source = ctx.createBufferSource();
    source.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800;
    band.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    source.connect(band).connect(env).connect(master);
    source.start(at, Math.random() * 0.5, 0.15);

    // corpo grave do tambor
    const body = ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(190, at);
    body.frequency.exponentialRampToValueAtTime(110, at + 0.08);
    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0.0001, at);
    bodyEnv.gain.exponentialRampToValueAtTime(peak * 0.5, at + 0.003);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    body.connect(bodyEnv).connect(master);
    body.start(at);
    body.stop(at + 0.1);
  }

  /** Rufar que acelera (110 ms → 65 ms entre batidas, sem virar zumbido) e cresce durante `durationMs`. */
  drumroll(durationMs: number) {
    const audio = this.ensure();
    if (!audio) return;
    const start = audio.ctx.currentTime + 0.05;
    const end = start + durationMs / 1000;
    for (let t = start; t < end;) {
      const progress = (t - start) / (end - start);
      this.snare(t, 0.08 + 0.5 * progress ** 1.5);
      t += 0.11 - 0.045 * progress;
    }
  }

  /** Prato + bumbo + caixa: o momento da revelação. */
  finale() {
    const audio = this.ensure();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const at = ctx.currentTime + 0.02;

    // prato
    const crash = ctx.createBufferSource();
    crash.buffer = noise;
    crash.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 4500;
    const crashEnv = ctx.createGain();
    crashEnv.gain.setValueAtTime(0.0001, at);
    crashEnv.gain.exponentialRampToValueAtTime(0.55, at + 0.005);
    crashEnv.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
    crash.connect(high).connect(crashEnv).connect(master);
    crash.start(at);
    crash.stop(at + 2.5);

    // bumbo
    const kick = ctx.createOscillator();
    kick.type = "sine";
    kick.frequency.setValueAtTime(150, at);
    kick.frequency.exponentialRampToValueAtTime(42, at + 0.3);
    const kickEnv = ctx.createGain();
    kickEnv.gain.setValueAtTime(0.0001, at);
    kickEnv.gain.exponentialRampToValueAtTime(0.9, at + 0.005);
    kickEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    kick.connect(kickEnv).connect(master);
    kick.start(at);
    kick.stop(at + 0.65);

    this.snare(at, 0.7);
  }

  /** Para tudo na hora (som desligado ou saiu da tela). */
  stop() {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.noise = null;
    void ctx?.close().catch(() => undefined);
  }
}

const SOUND_KEY = "quiz.podiumSound";

export function loadSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundPreference(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // sem storage: vale só nesta tela
  }
}
