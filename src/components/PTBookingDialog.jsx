import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/pushManager'
import { useLanguage } from '../context/LanguageContext'

/**
 * PT booking dialog — scoped to a single package (pt_members row).
 *
 * Props:
 *  - athlete:    { id, name, branch_id }
 *  - open:       boolean
 *  - ptPackage:  { id, sessionsLeft, coachIds: string[], coachNames: string[] } | null
 *                Passed by Dashboard's PTTab when the athlete clicks "Book" on a package card.
 *                If null, the dialog falls back to a legacy single-package lookup.
 *  - onClose:    fn
 *  - onBooked:   fn (invoked after successful booking → triggers parent refetch)
 */
export default function PTBookingDialog({ athlete, open, ptPackage, onClose, onBooked }) {
  const { t } = useLanguage()
  const [coachOptions, setCoachOptions] = useState([]) // [{ id, name }]
  const [selectedCoachId, setSelectedCoachId] = useState('')
  const [packageId, setPackageId] = useState(null)
  const [sessionsLeft, setSessionsLeft] = useState(0)
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
    setTime('')
    setNotes('')
  }, [open, ptPackage?.id])

  async function loadData() {
    setCoachLoading(true)

    // Preferred path: ptPackage is supplied by the per-card Book button
    if (ptPackage && Array.isArray(ptPackage.coachIds) && ptPackage.coachIds.length > 0) {
      const opts = ptPackage.coachIds.map((id, i) => ({
        id,
        name: ptPackage.coachNames?.[i] || 'Coach',
      }))
      setCoachOptions(opts)
      setSelectedCoachId(opts[0].id) // default to primary (first chip)
      setPackageId(ptPackage.id)
      setSessionsLeft(ptPackage.sessionsLeft ?? 0)
      setCoachLoading(false)
      return
    }

    // Legacy fallback: athlete with a single package and no per-card Book passed in.
    // Mirrors the pre-multi-coach behavior — pick the most recent active pt_members row.
    const { data: rows } = await supabase.from('pt_members')
      .select('id, total_sessions, used_sessions, coach_id, coach_name')
      .eq('student_id', athlete.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
    const pm = rows?.[0]
    if (!pm) {
      setCoachOptions([])
      setSelectedCoachId('')
      setPackageId(null)
      setSessionsLeft(0)
      setCoachLoading(false)
      return
    }

    const remaining = Math.max(0, (pm.total_sessions || 0) - (pm.used_sessions || 0))
    setPackageId(pm.id)
    setSessionsLeft(remaining)

    const { data: pmcRows } = await supabase
      .from('pt_member_coaches')
      .select('coach_id')
      .eq('pt_member_id', pm.id)
    const ids = (pmcRows || []).map((r) => r.coach_id)
    const fallbackIds = ids.length > 0 ? ids : (pm.coach_id ? [pm.coach_id] : [])

    if (fallbackIds.length === 0) {
      setCoachOptions([])
      setSelectedCoachId('')
      setCoachLoading(false)
      return
    }

    const { data: cData } = await supabase.from('coaches').select('id, name').in('id', fallbackIds)
    const opts = fallbackIds.map((id) => ({
      id,
      name: cData?.find((c) => c.id === id)?.name || pm.coach_name || 'Coach',
    }))
    setCoachOptions(opts)
    setSelectedCoachId(opts[0].id)
    setCoachLoading(false)
  }

  const selectedCoach = useMemo(
    () => coachOptions.find((c) => c.id === selectedCoachId) || null,
    [coachOptions, selectedCoachId]
  )

  async function book() {
    if (!selectedCoach || !date || !time || sessionsLeft <= 0) return
    setSubmitting(true)
    const { error } = await supabase.from('personal_training_bookings').insert({
      student_id: athlete.id,
      coach_id: selectedCoach.id,
      coach_name: selectedCoach.name,
      pt_member_id: packageId,
      branch_id: athlete.branch_id,
      booking_date: date,
      booking_time: time,
      status: 'pending',
      notes: notes || null,
    })
    if (error) { alert(t('pt.errorPrefix') + error.message); setSubmitting(false); return }

    // Notify the picked coach (single — only the booked coach is notified)
    await sendNotification({
      recipientId: selectedCoach.id,
      recipientType: 'coach',
      notificationType: 'pt_booking_new',
      title: t('pt.newRequestTitle'),
      message: t('pt.newRequestMessage', { name: athlete.name, date, time }),
      branchId: athlete.branch_id,
    })
    // Confirm to the athlete
    await sendNotification({
      recipientId: athlete.id,
      recipientType: 'athlete',
      notificationType: 'pt_booking_new',
      title: 'PT request sent',
      message: `Your PT booking request for ${date} ${time} was sent to ${selectedCoach.name}.`,
      branchId: athlete.branch_id,
    })
    setTime(''); setNotes(''); onBooked?.(); onClose()
    setSubmitting(false)
  }

  if (!open) return null

  const noCoach = !coachLoading && coachOptions.length === 0

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
        ) : noCoach ? (
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
              <label className="form-label">
                {coachOptions.length > 1 ? (t('pt.pickCoachLabel') || 'Book with') : t('pt.coachLabel')}
              </label>
              {coachOptions.length > 1 ? (
                <select
                  className="form-input"
                  value={selectedCoachId}
                  onChange={(e) => setSelectedCoachId(e.target.value)}
                >
                  {coachOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <input className="form-input" value={selectedCoach?.name || ''} readOnly style={{ opacity: 0.7 }} />
              )}
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
            <button className="btn-primary" onClick={book} disabled={submitting || sessionsLeft <= 0 || !date || !time || !selectedCoachId}>
              {submitting ? t('pt.booking2') : t('pt.confirmBooking')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
