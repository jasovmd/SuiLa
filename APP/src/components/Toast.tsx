import { useLayoutEffect, useRef } from "react"


export function Toast({ message }: { message: string | null }) {
  const box = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = box.current
    const page = element?.closest<HTMLElement>(".page")
    if (!element || !page) return
    page.style.setProperty("--toast-space", message ? `${element.offsetHeight + 12}px` : "0px")
  }, [message])

  return (
    <div className="toast" role="status" aria-live="polite" ref={box}>
      {message}
    </div>
  )
}
