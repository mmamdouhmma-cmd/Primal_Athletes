import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function CoachProfileDialog({ coachId, isAssigned, open, onClose }) {
  const [coach, setCoach] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !coachId) return
    setLoading(true)
    ;(async () => {
      let { data: c } = await supabase.from('coaches')
        .select('id, name, phone_number, credentials, photo')
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

        <div className="modal-title">Coach profile</div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
            <div className="spinner" />
          </div>
        ) : !coach ? (
          <div className="empty-state">Coach not found.</div>
        ) : (
          <>
            <div className="coach-profile-header">
              <div className="coach-profile-avatar">
                {coach.photo ? <img src={coach.photo} alt="" /> : coach.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="coach-profile-name">{coach.name}</div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-header"><span className="card-title">Details</span></div>
              <div className="card-body">
                <div className="detail-row">
                  <span className="detail-key">Name</span>
                  <span className="detail-val">{coach.name || '-'}</span>
                </div>
                {coach.credentials && (
                  <div className="detail-row">
                    <span className="detail-key">Credentials</span>
                    <span className="detail-val">{coach.credentials}</span>
                  </div>
                )}
                {isAssigned && (
                  <div className="detail-row">
                    <span className="detail-key">Phone</span>
                    <span className="detail-val">{coach.phone_number || '-'}</span>
                  </div>
                )}
              </div>
            </div>

            <button className="btn-outline" onClick={onClose} style={{ width: '100%', marginTop: 12 }}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}
