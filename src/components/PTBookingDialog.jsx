import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/pushManager'
import { useLanguage } from '../context/LanguageContext'

export default function PTBookingDialog({ athlete, open, onClose, onBooked }) {
  const { t } = useLanguage()
  const [balance, setBalance] = useState(0)
  const [coach, setCoach] = useState(null)
  const [coachLoading, setCoachLoading] = useState(true)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    loadData()
    const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1)
    setDate(tmrw.toISOString().split('T')[0])
  }, [open])

  async function loadData() {
    setCoachLoading(true)
    const { data: p } = await supabase.from('personal_training_purchases')
      .select('sessions_remaining, coach_id').eq('student_id', athlete.id)
      .gt('sessions_remaining', 0).order('created_at', { ascending: false })
    setBalance((p || []).reduce((s, r) => s + (r.sessions_remaining || 0), 0))
    if (p?.length && p[0].coach_id) {
      let { data: c } = await supabase.from('coaches').select('id,name').eq('id', p[0].coach_id).maybeSingle()
      setCoach(c)
    } else setCoach(null)
    setCoachLoading(false)
  }

  async function book() {
    if (!coach || !date || !time || balance <= 0) return
    setSubmitting(true)
    const { error } = await supabase.from('personal_training_bookings').insert({
      student_id: athlete.id, coach_id: coach.id, branch_id: athlete.branch_id,
      booking_date: date, booking_time: time, status: 'pending', notes: notes || null,
    })
    if (error) { alert(t('pt.errorPrefix') + error.message); setSubmitting(false); return }
    // Notify the coach (push to coach's devices)
    await sendNotification({
      recipientId: coach.id,
      recipientType: 'coach',
      notificationType: 'pt_booking_new',
      title: t('pt.newRequestTitle'),
      message: t('pt.newRequestMessage', { name: athlete.name, date, time }),
      branchId: athlete.branch_id,
    })
    // Confirm to the athlete (push to athlete's devices)
    await sendNotification({
      recipientId: athlete.id,
      recipientType: 'athlete',
      notificationType: 'pt_booking_new',
      title: 'PT request sent',
      message: `Your PT booking request for ${date} ${time} was sent to ${coach.name}.`,
      branchId: athlete.branch_id,
    })
    setTime(''); setNotes(''); onBooked?.(); onClose()
    setSubmitting(false)
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="modal-title">{t('pt.modalTitle')}</div>

        {coachLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
            <div className="spinner" />
          </div>
        ) : !coach ? (
          <>
            <div className="alert-error" style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>{t('pt.noCoachTitle')}</div>
              <div style={{ fontSize: 11, color: 'var(--pf-text2)', marginTop: 4 }}>{t('pt.noCoachSubtext')}</div>
            </div>
            <button className="btn-outline" onClick={onClose} style={{ width: '100%' }}>{t('common.close')}</button>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">{t('pt.coachLabel')}</label>
              <input className="form-input" value={coach.name} readOnly style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('pt.dateLabel')}</label>
              <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('pt.timeLabel')}</label>
              <input className="form-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('pt.notesLabel')}</label>
              <textarea className="form-input" rows={3} placeholder={t('pt.notesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'none' }} />
            </div>
            <button className="btn-primary" onClick={book} disabled={submitting || balance <= 0 || !date || !time}>
              {submitting ? t('pt.booking2') : t('pt.confirmBooking')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
