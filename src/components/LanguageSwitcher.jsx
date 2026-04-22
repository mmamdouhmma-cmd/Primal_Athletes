import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

const GlobeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
  </svg>
)

const CheckIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default function LanguageSwitcher() {
  const { lang, setLang, languages, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className="theme-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        title={t('common.language')}
        aria-label={t('common.language')}
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--pf-text2)' }}
      >
        {GlobeIcon}
        <span style={{ fontSize: 10 }}>{lang}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 42,
            right: 0,
            background: 'var(--pf-surface)',
            border: '1px solid var(--pf-border)',
            borderRadius: 10,
            padding: 6,
            minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            zIndex: 300,
          }}
        >
          <div style={{
            padding: '6px 12px', fontSize: 10, fontWeight: 700,
            color: 'var(--pf-text3)', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {t('common.language')}
          </div>
          {languages.map((l) => {
            const isActive = l.code === lang
            return (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--pf-blue)' : 'var(--pf-text)',
                  border: 'none',
                  background: isActive ? 'var(--pf-blue-soft, rgba(59,130,246,0.12))' : 'transparent',
                  width: '100%', textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--pf-surface3)' }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ flex: 1 }}>{l.nativeLabel}</span>
                {isActive && CheckIcon}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
