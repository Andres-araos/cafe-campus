/** Sonido corto con la API de audio del navegador: no necesita archivos. */
export function chime(notes = [880, 1175]) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18 * notes.length + 0.2)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    notes.forEach((f, i) => osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.14))
    osc.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + 0.18 * notes.length + 0.2)
    osc.onended = () => ctx.close()
  } catch {
    // El navegador puede bloquear el audio hasta que la persona toque la página: el aviso visual basta
  }
}
