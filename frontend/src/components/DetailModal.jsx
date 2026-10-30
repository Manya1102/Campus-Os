import { useEffect } from 'react'

function DetailModal({ title, onClose, children }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="detail-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
        <div className="detail-modal-heading">
          <h2 id="detail-modal-title">{title}</h2>
          <button type="button" className="detail-modal-close" onClick={onClose} aria-label="Close details">×</button>
        </div>
        <div className="detail-modal-content">{children}</div>
      </section>
    </div>
  )
}

export default DetailModal
