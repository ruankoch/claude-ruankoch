/* Audio context must be created/resumed inside a user gesture (iOS), so
   ensureAudio() is called when a set is logged; beepThree() fires later. */

let audioCtx: AudioContext | null = null;

export function ensureAudio(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* no audio available */
  }
}

export function beepThree(): void {
  try {
    ensureAudio(); // resume if the context was suspended during the rest
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + 0.02;
    // short ascending chime — clear and noticeable when rest runs out
    const notes = [660, 880, 1175];
    notes.forEach((freq, i) => {
      const off = i * 0.18;
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(0.42, t0 + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.24);
      o.connect(g);
      g.connect(audioCtx!.destination);
      o.start(t0 + off);
      o.stop(t0 + off + 0.26);
    });
  } catch {
    /* ignore */
  }

  // Belt-and-braces cues for a locked/backgrounded phone (best effort).
  try {
    navigator.vibrate?.([120, 80, 120, 80, 220]);
  } catch {
    /* ignore */
  }
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rest over — go lift', { silent: false });
    }
  } catch {
    /* ignore */
  }
}
