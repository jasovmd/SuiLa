import { useLayoutEffect, useRef, type PointerEvent, type RefObject } from "react"
import { tabProgress } from "./swipe"


const startPx = 8


export function useTabSwipe(
  shell: RefObject<HTMLElement | null>,
  page: number,
  count: number,
  onChange: (page: number) => void,
) {
  const slide = useRef<{
    id: number
    x: number
    first: number
    last: number
    active: boolean
  } | null>(null)
  
  const swallowClick = useRef(false)

  useLayoutEffect(() => {
    shell.current?.style.setProperty("--page", String(page))
    shell.current?.style.setProperty("--nav-progress", String(page))
  }, [shell, page])

  const progressAt = (x: number) => {
    const state = slide.current
    return state ? tabProgress(x, state.first, state.last, count) : page
  }

  const finish = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const state = slide.current
    const element = shell.current
    if (!state || !element || event.pointerId !== state.id) return
    const target = cancelled ? page : Math.round(progressAt(event.clientX))
    slide.current = null
    if (!state.active) return
    
    window.setTimeout(() => (swallowClick.current = false), 0)
    element.classList.remove("is-dragging")
    element.style.setProperty("--nav-progress", String(target))
    if (target !== page) onChange(target)
  }

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      swallowClick.current = false
      if (event.pointerType === "mouse" && event.button !== 0) return
      const centers = [...event.currentTarget.querySelectorAll("button")].map(
        (button) => {
          const rect = button.getBoundingClientRect()
          return rect.left + rect.width / 2
        },
      )
      slide.current = {
        id: event.pointerId,
        x: event.clientX,
        first: centers[0] ?? 0,
        last: centers[centers.length - 1] ?? 0,
        active: false,
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const state = slide.current
      const element = shell.current
      if (!state || !element || event.pointerId !== state.id) return
      if (!state.active) {
        if (Math.abs(event.clientX - state.x) < startPx) return
        state.active = true
        swallowClick.current = true
        element.classList.add("is-dragging")
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          
        }
      }
      element.style.setProperty("--nav-progress", String(progressAt(event.clientX)))
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, false),
    
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onClickCapture: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }
}
