import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../context/LanguageContext'

export default function CoachProfileDialog({ coachId, isAssigned, open, onClose }) {
  const { t } = useLanguage()
  const [coach, setCoach] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !coachId) return
    setLoading(true)
    ;(async () => {
      let { data: c } = await supabase.from('coaches')
        .select('id, name, phone_number, email, credentials, photo_url, instagram_url')
        .eq('id', coachId).maybeSingle()
      setCoach(c)
      setLoading(false)
    })()
  }, [open, coachId])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="modal-title">{t('coachDialog.title')}</div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
            <div className="spinner" />
          </div>
        ) : !coach ? (
          <div className="empty-state">{t('coachDialog.notFound')}</div>
        ) : (
          <>
            <div className="coach-profile-header">
              <div className="coach-profile-avatar">
                {coach.photo_url ? <img src={coach.photo_url} alt="" /> : coach.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="coach-profile-name">{coach.name}</div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header"><span className="card-title">{t('coachDialog.details')}</span></div>
              <div className="card-body">
                <div className="detail-row">
                  <span className="detail-key">{t('coachDialog.nameLabel')}</span>
                  <span className="detail-val">{coach.name || '-'}</span>
                </div>
                {coach.credentials && (
                  <div className="detail-row">
                    <span className="detail-key">{t('coachDialog.credentials')}</span>
                    <span className="detail-val">{coach.credentials}</span>
                  </div>
                )}
                {isAssigned && (
                  <div className="detail-row">
                    <span className="detail-key">{t('coachDialog.phoneLabel')}</span>
                    <span className="detail-val">{coach.phone_number || '-'}</span>
                  </div>
                )}
                {isAssigned && coach.email && (
                  <div className="detail-row">
                    <span className="detail-key">E-mail</span>
                    <span className="detail-val">{coach.email}</span>
                  </div>
                )}
              </div>
            </div>

            {coach.instagram_url && /^https?:\/\//i.test(coach.instagram_url) && (
              <a
                href={coach.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginTop: 12, textDecoration: 'none' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                Visit Coach's Instagram
              </a>
            )}
            <button className="btn-outline" onClick={onClose} style={{ width: '100%', marginTop: 12 }}>{t('common.close')}</button>
          </>
        )}
      </div>
    </div>
  )
}
