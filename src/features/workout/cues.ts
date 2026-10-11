/*
 * Signaux pendant la séance : bips (Web Audio), voix française (synthèse vocale) et vibration.
 * Safari n'autorise le son qu'après un toucher : unlockCues() est appelé quand on valide une série
 * ou qu'on lance un chrono. Tout est facultatif : sans prise en charge, rien ne se passe.
 */

export interface CueOptions {
  /** Bips et vibrations (réglage « Son du minuteur »). */
  sound: boolean
  /** Annonces à voix haute (réglage « Annonces vocales »). */
  voice: boolean
}

type AudioContextClass = typeof AudioContext

let audio: AudioContext | null = null
let voicePrimed = false

function audioContextClass(): AudioContextClass | null {
  if ('AudioContext' in window) return window.AudioContext
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext
  return legacy ?? null
}

function audioContext(): AudioContext | null {
  if (audio) return audio
  const Context = audioContextClass()
  if (!Context) return null
  try {
    audio = new Context()
  } catch {
    return null
  }
  return audio
}

function canSpeak(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

/** À appeler pendant un toucher : Safari autorise ensuite les bips et la voix. */
export function unlockCues(options: CueOptions): void {
  if (options.sound) {
    const context = audioContext()
    if (context && context.state !== 'running') void context.resume().catch(() => undefined)
  }
  if (options.voice && !voicePrimed && canSpeak()) {
    // Une phrase muette prononcée pendant le geste débloque les annonces suivantes.
    const silent = new SpeechSynthesisUtterance(' ')
    silent.volume = 0
    window.speechSynthesis.speak(silent)
    voicePrimed = true
  }
}

const TONES = {
  /** Décompte : 3, 2, 1. */
  tick: [{ at: 0, frequency: 880, duration: 0.09 }],
  /** C'est parti (fin du repos, objectif atteint). */
  go: [
    { at: 0, frequency: 988, duration: 0.14 },
    { at: 0.18, frequency: 1319, duration: 0.32 },
  ],
} as const

export type Tone = keyof typeof TONES

/** Un bip court (sans effet si le son n'est pas débloqué). */
export function beep(tone: Tone): void {
  const context = audio
  if (context?.state !== 'running') return
  const start = context.currentTime
  for (const { at, frequency, duration } of TONES[tone]) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + at)
    gain.gain.exponentialRampToValueAtTime(0.5, start + at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start + at)
    oscillator.stop(start + at + duration + 0.05)
  }
}

/** Annonce une phrase en français (remplace l'annonce en cours). */
export function speak(text: string): void {
  if (!canSpeak()) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'fr-FR'
  utterance.rate = 1.05
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

/** Fait vibrer le téléphone (Android ; l'iPhone ne le permet pas aux sites). */
export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

/** Signal complet : bip, vibration, puis phrase (selon les réglages). */
export function cue(tone: Tone, options: CueOptions, text?: string): void {
  if (options.sound) {
    beep(tone)
    vibrate(tone === 'tick' ? 60 : [200, 100, 200])
  }
  if (options.voice && text) speak(text)
}
