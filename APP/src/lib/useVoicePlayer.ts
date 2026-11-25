import { useEffect, useRef, useState } from "react"



export function useVoicePlayer() {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const audio = useRef<HTMLAudioElement | null>(null)

  const stop = () => {
    window.speechSynthesis?.cancel()
    audio.current?.pause()
    audio.current = null
    window.clearTimeout(timer.current)
    setPlayingId(null)
  }

  const play = (
    id: string,
    text: string,
    lang: string,
    durationSec: number,
    audioUrl?: string,
  ) => {
    stop()
    setPlayingId(id)
    const done = () => setPlayingId((current) => (current === id ? null : current))
    if (audioUrl) {
      const player = new Audio(audioUrl)
      audio.current = player
      player.onended = done
      player.onerror = done
      
      player.play().catch(done)
      return
    }
    const canSpeak = "speechSynthesis" in window
    if (canSpeak) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      utterance.onend = done
      utterance.onerror = done
      window.speechSynthesis.speak(utterance)
    }
    
    
    timer.current = window.setTimeout(done, (durationSec + (canSpeak ? 5 : 0)) * 1000)
  }

  
  useEffect(() => stop, [])

  return { playingId, play, stop }
}
