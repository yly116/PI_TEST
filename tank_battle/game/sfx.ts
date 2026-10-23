export type SoundName =
  | 'shoot'
  | 'shootEnemy'
  | 'brick'
  | 'steel'
  | 'hit'
  | 'explode'
  | 'powerup'
  | 'life'
  | 'freeze'
  | 'level'
  | 'gameover'
  | 'victory'
  | 'start'
  | 'pause';

type AudioCtor = typeof AudioContext;

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.ensure();
    return this.enabled;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.ensure();
  }

  private ensure(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number,
    endFreq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  play(name: SoundName) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;

    switch (name) {
      case 'shoot':
        this.tone(520, 170, 0.08, 'square', 0.022);
        break;
      case 'shootEnemy':
        this.tone(300, 110, 0.08, 'square', 0.012);
        break;
      case 'brick':
        this.tone(190, 70, 0.07, 'sawtooth', 0.025);
        break;
      case 'steel':
        this.tone(1100, 650, 0.06, 'square', 0.018);
        break;
      case 'hit':
        this.tone(240, 70, 0.12, 'square', 0.03);
        break;
      case 'explode':
        this.tone(150, 35, 0.36, 'sawtooth', 0.06);
        this.tone(90, 28, 0.42, 'square', 0.035, 0.02);
        break;
      case 'powerup':
        this.tone(660, 660, 0.08, 'sine', 0.05);
        this.tone(880, 880, 0.08, 'sine', 0.05, 0.08);
        this.tone(1320, 1320, 0.13, 'sine', 0.05, 0.16);
        break;
      case 'life':
        this.tone(523, 523, 0.09, 'triangle', 0.05);
        this.tone(784, 784, 0.09, 'triangle', 0.05, 0.09);
        this.tone(1046, 1046, 0.16, 'triangle', 0.05, 0.18);
        break;
      case 'freeze':
        this.tone(1568, 700, 0.2, 'sine', 0.04);
        break;
      case 'level':
        this.tone(523, 523, 0.1, 'square', 0.035);
        this.tone(659, 659, 0.1, 'square', 0.035, 0.11);
        this.tone(784, 784, 0.1, 'square', 0.035, 0.22);
        this.tone(1046, 1046, 0.22, 'square', 0.035, 0.33);
        break;
      case 'gameover':
        this.tone(392, 392, 0.16, 'sawtooth', 0.04);
        this.tone(311, 311, 0.16, 'sawtooth', 0.04, 0.17);
        this.tone(233, 233, 0.16, 'sawtooth', 0.04, 0.34);
        this.tone(155, 60, 0.5, 'sawtooth', 0.05, 0.51);
        break;
      case 'victory':
        this.tone(523, 523, 0.12, 'square', 0.035);
        this.tone(659, 659, 0.12, 'square', 0.035, 0.13);
        this.tone(784, 784, 0.12, 'square', 0.035, 0.26);
        this.tone(1046, 1046, 0.3, 'square', 0.04, 0.39);
        break;
      case 'start':
        this.tone(262, 262, 0.09, 'square', 0.035);
        this.tone(392, 392, 0.09, 'square', 0.035, 0.1);
        this.tone(523, 523, 0.16, 'square', 0.035, 0.2);
        break;
      case 'pause':
        this.tone(440, 330, 0.1, 'triangle', 0.03);
        break;
    }
  }

  close() {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
