import { useEffect, useId, useRef, type ReactNode } from 'react'
import '../styles/modal.css'

interface ModalProps {
  title: string
  onClose: () => void
  busy?: boolean
  children: ReactNode
  footer?: ReactNode
}

export default function Modal({ title, onClose, busy = false, children, footer }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    element.showModal()
    return () => { element.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return (
    <dialog ref={dialog} className="app-modal" aria-labelledby={titleId} aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
      }}>
      <header className="modal-header"><h2 id={titleId}>{title}</h2>
        <button className="modal-button modal-close" type="button" disabled={busy} aria-label={`Закрыть: ${title}`} onClick={onClose}>✕</button>
      </header>
      <div className="modal-content">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </dialog>
  )
}
