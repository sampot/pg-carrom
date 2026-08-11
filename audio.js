/** 康樂球 — Web Audio 合成音效（補充在 assets/sfx 的 Kenney impact 之外）。 */

export class CarromAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = 0.2;
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  setEnabled(on) {
    this.enabled = on;
  }

  tone(freq, dur, type = "triangle", gain = 0.1, when = 0, slide = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.03, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  click() {
    this.tone(480, 0.05, "triangle", 0.06);
  }
  pot() {
    this.tone(420, 0.07, "triangle", 0.07);
    this.tone(620, 0.09, "sine", 0.06, 0.05);
  }
  win() {
    this.tone(523, 0.08, "sine", 0.08);
    this.tone(659, 0.08, "sine", 0.08, 0.08);
    this.tone(784, 0.1, "sine", 0.08, 0.16);
    this.tone(1046, 0.22, "triangle", 0.08, 0.24);
  }
  lose() {
    this.tone(330, 0.12, "triangle", 0.06);
    this.tone(247, 0.2, "sine", 0.06, 0.1);
  }
}
