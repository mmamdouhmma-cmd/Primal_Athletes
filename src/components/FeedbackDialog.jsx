import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/pushManager'
import { formatDate } from '../lib/helpers'
import { useLanguage } from '../context/LanguageContext'

/*
 * FeedbackDialog
 * ─────────────────────────────────────────────────────────
 * Two-mode panel:
 *   mode === 'list' → "Your Feedbacks" + Add Feedback button
 *   mode === 'add'  → Add Feedback form (discipline / class / coach dropdowns
 *                     all optional, feedback text required, anonymous toggle)
 *
 * Anonymous submissions still record `student_id` in the DB (for internal
 * tracking), but the management portal reads from `feedback_management_view`
 * which scrubs identity for anonymous rows server-side.
 */

export default function FeedbackDialog({ athlete, open, onClose }) {
  const { t } = useLanguage()
  const [mode, setMode] = useState('list')
  const [myFeedbacks, setMyFeedbacks] = useState([])
  const [loading, setLoading] = useState(false)

  // Dropdown option pools
  const [disciplines, setDisciplines] = useState([])
  const [classes, setClasses] = useState([])
  const [coaches, setCoaches] = useState([])

  // Add-form state
  const [disciplineId, setDisciplineId] = useState('')
  const [classId, setClassId] = useState('')
  const [coachId, setCoachId] = useState('')
  const [text, setText] = useState('')
  const [isAnon, setIsAnon] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadMyFeedbacks = useCallback(async () => {
    if (!athlete?.id) return
    setLoading(true)
    // Athlete sees their own feedbacks with full joins — anonymity is only
    // hidden from the management view, not from the author themself.
    const { data } = await supabase
      .from('feedbacks')
      .select(`
        id, is_anonymous, feedback_text, submitted_at,
        discipline:discipline_id (id, name, color),
        class:class_schedule_id (id, name, start_time, day_of_week),
        coach:coach_id (id, name)
      `)
      .eq('student_id', athlete.id)
      .order('submitted_at', { ascending: false })
    setMyFeedbacks(data || [])
    setLoading(false)
  }, [athlete?.id])

  // Initial load when dialog opens
  useEffect(() => {
    if (!open) return
    setMode('list')
    loadMyFeedbacks()
  }, [open, loadMyFeedbacks])

  // Lazy-load dropdown options the first time we enter add mode
  useEffect(() => {
    if (mode !== 'add') return
    if (disciplines.length && classes.length && coaches.length) return
    ;(async () => {
      const [dRes, csRes, cRes] = await Promise.all([
        supabase.from('disciplines').select('id, name, color').eq('active', true).order('name'),
        supabase
          .from('class_schedules')
          .select('id, name, start_time, day_of_week, discipline_id, branch_id')
          .eq('branch_id', athlete?.branch_id || '')
          .order('day_of_week')
          .order('start_time'),
        supabase
          .from('coaches')
          .select('id, name, role')
          .in('role', ['coach', 'assistant-coach', 'assistant_coach', 'head-coach'])
          .eq('active', true)
          .order('name'),
      ])
      setDisciplines(dRes.data || [])
      setClasses(csRes.data || [])
      setCoaches(cRes.data || [])
    })()
  }, [mode, athlete?.branch_id])

  function openAdd() {
    setDisciplineId('')
    setClassId('')
    setCoachId('')
    setText('')
    setIsAnon(false)
    setError('')
    setMode('add')
  }

  async function submit() {
    if (!text.trim()) { setError(t('feedbackDialog.errWriteFeedback')); return }
    if (!athlete?.id) { setError(t('feedbackDialog.errNotSignedIn')); return }
    setSubmitting(true)
    setError('')
    const { error: insErr } = await supabase.from('feedbacks').insert({
      student_id: athlete.id,
      is_anonymous: isAnon,
      discipline_id: disciplineId || null,
      class_schedule_id: classId || null,
      coach_id: coachId || null,
      feedback_text: text.trim(),
      branch_id: athlete.branch_id || null,
    })
    if (insErr) {
      setError(insErr.message || t('feedbackDialog.errCouldNotSubmit'))
      setSubmitting(false)
      return
    }
    // Fire-and-forget notification to branch management/reception. We deliberately
    // do not leak the athlete's name when the submission is anonymous.
    notifyManagement({
      branchId: athlete.branch_id,
      isAnonymous: isAnon,
      authorName: athlete.name,
      discipline: disciplines.find((d) => d.id === disciplineId) || null,
      t,
    }).catch((e) => console.error('feedback notify failed:', e))

    setSubmitting(false)
    await loadMyFeedbacks()
    setMode('list')
  }

  if (!open) return null

  // Filter classes to the selected discipline when one is picked
  const filteredClasses = disciplineId
    ? classes.filter((c) => c.discipline_id === disciplineId)
    : classes

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 440, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {mode === 'list' ? (
          <>
            <div className="modal-title">{t('feedbackDialog.yourFeedbacks')}</div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <div className="spinner" />
              </div>
            ) : myFeedbacks.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                {t('feedbackDialog.noneSubmitted')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {myFeedbacks.map((f) => (
                  <FeedbackRow key={f.id} fb={f} />
                ))}
              </div>
            )}

            <button className="btn-primary" onClick={openAdd} style={{ width: '100%', marginTop: 4 }}>
              {t('feedbackDialog.addFeedback')}
            </button>
          </>
        ) : (
          <>
            <div className="modal-title">{t('feedbackDialog.addTitle')}</div>

            <div className="form-group">
              <label className="form-label">{t('feedbackDialog.disciplineOptional')}</label>
              <select
                className="form-input"
                value={disciplineId}
                onChange={(e) => { setDisciplineId(e.target.value); setClassId('') }}
              >
                <option value="">{t('feedbackDialog.emptyOption')}</option>
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('feedbackDialog.classOptional')}</label>
              <select
                className="form-input"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">{t('feedbackDialog.emptyOption')}</option>
                {filteredClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('feedbackDialog.coachOptional')}</label>
              <select
                className="form-input"
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
              >
                <option value="">{t('feedbackDialog.emptyOption')}</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('feedbackDialog.yourFeedbackRequired')}</label>
              <textarea
                className="form-input"
                rows={5}
                placeholder={t('feedbackDialog.textPlaceholder')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            <div className="toggle-row" style={{ borderBottom: 'none', padding: '4px 0 14px' }}>
              <div>
                <div className="toggle-label">{t('feedbackDialog.submitAnon')}</div>
                <div style={{ fontSize: 11, color: 'var(--pf-text3)', marginTop: 2 }}>
                  {t('feedbackDialog.anonSubtext')}
                </div>
              </div>
              <button
                type="button"
                className={`toggle-switch ${isAnon ? 'on' : ''}`}
                onClick={() => setIsAnon((v) => !v)}
                aria-pressed={isAnon}
              />
            </div>

            {error && <div className="alert-error">{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn-outline"
                onClick={() => setMode('list')}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                {t('feedbackDialog.back')}
              </button>
              <button
                className="btn-primary"
                onClick={submit}
                disabled={submitting || !text.trim()}
                style={{ flex: 1 }}
              >
                {submitting ? t('feedbackDialog.sendingEllipsis') : t('feedbackDialog.submit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FeedbackRow({ fb }) {
  const { t } = useLanguage()
  const d = fb.discipline
  const cls = fb.class
  const co = fb.coach
  const metaBits = [
    d?.name,
    cls ? classLabel(cls) : null,
    co?.name ? t('feedbackDialog.coachPrefix', { name: co.name }) : null,
  ].filter(Boolean)

  return (
    <div
      style={{
        background: 'var(--pf-surface2)',
        border: '1px solid var(--pf-border)',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {d ? (
            <span
              style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                background: (d.color || '#64748B') + '20', color: d.color || '#64748B',
              }}
            >
              {d.name}
            </span>
          ) : null}
          {fb.is_anonymous && (
            <span
              style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                background: 'rgba(148,163,184,0.18)', color: 'var(--pf-text2)',
              }}
            >
              {t('feedbackDialog.anonymousBadge')}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--pf-text3)', whiteSpace: 'nowrap' }}>
          {formatDate(fb.submitted_at)}
        </span>
      </div>
      {metaBits.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--pf-text3)', marginBottom: 4 }}>
          {metaBits.join(' · ')}
        </div>
      )}
      <div style={{ fontSize: 13, color: 'var(--pf-text)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
        {fb.feedback_text}
      </div>
    </div>
  )
}

function classLabel(c) {
  if (!c) return ''
  const day = (c.day_of_week || '').slice(0, 3)
  const t = c.start_time ? formatTime12(c.start_time) : ''
  const parts = [c.name, day, t].filter(Boolean)
  return parts.join(' · ')
}

function formatTime12(hms) {
  if (!hms) return ''
  const [hStr, m] = hms.split(':')
  let h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

/*
 * notifyManagement
 * Mirrors primal-fitness NotificationContext.notifyBranchStaff — insert one
 * notification row per active management/reception staff member in the branch.
 * Super admins are skipped to match existing behavior (they poll their own
 * data via the management page).
 */
async function notifyManagement({ branchId, isAnonymous, authorName, discipline, t }) {
  if (!branchId) return
  const { data: staff } = await supabase
    .from('coaches')
    .select('id, role, portal_access, branch_id, branch_access, active')
    .eq('active', true)
  if (!staff?.length) return

  const targets = staff.filter((s) => {
    if (s.role === 'super_admin') return false
    const hasNoBranch = !s.branch_id && (!s.branch_access || s.branch_access.length === 0)
    const belongsToBranch =
      hasNoBranch || s.branch_id === branchId || (s.branch_access || []).includes(branchId)
    if (!belongsToBranch) return false
    const access = s.portal_access || []
    return (
      access.includes('management') ||
      access.includes('reception') ||
      ['manager', 'branch_manager', 'receptionist'].includes(s.role)
    )
  })
  if (targets.length === 0) return

  const who = isAnonymous ? t('feedbackDialog.anonMember') : authorName || t('feedbackDialog.aMember')
  const about = discipline?.name ? t('feedbackDialog.aboutDiscipline', { discipline: discipline.name }) : ''
  await Promise.all(
    targets.map((s) =>
      sendNotification({
        recipientId: s.id,
        recipientType: s.role === 'receptionist' ? 'reception' : 'management',
        notificationType: 'feedback_submitted',
        title: t('feedbackDialog.newNotifTitle'),
        message: t('feedbackDialog.submittedFeedback', { who, about }),
        branchId,
      })
    )
  )
}
