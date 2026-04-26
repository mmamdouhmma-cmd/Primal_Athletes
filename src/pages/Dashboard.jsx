import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/pushManager'
import { formatDate, daysUntil, getInitials } from '../lib/helpers'
import NotificationBell from '../components/NotificationBell'
import PTBookingDialog from '../components/PTBookingDialog'
import CoachProfileDialog from '../components/CoachProfileDialog'
import ProfileEditDialog from '../components/ProfileEditDialog'
import FeedbackDialog from '../components/FeedbackDialog'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useLanguage } from '../context/LanguageContext'
import {
  GYM_PARKOUR_CONFIG,
  isGymParkourEntry,
  computeGymParkourScore,
  FLEX_META,
  LEVEL_META,
} from '../lib/gymParkourProgress'
import { getDisciplineSections } from '../lib/progressConfigs'

/* ── SVG Icons ── */
const Icons = {
  logo: <img src="/favicon.png" alt="Primal" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />,
  home: <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  schedule: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  progress: <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  profile: <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  back: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--pf-text2)" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>,
  sun: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  feedback: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
}

/* ── Helpers ── */
function discName(idOrSlug, disciplines) {
  const d = disciplines.find((x) => x.id === idOrSlug || x.slug === idOrSlug)
  return d?.name || ''
}

function isBJJDisc(d) {
  return !!d && /bjj|jiu.?jitsu/i.test(d.name || '')
}

function formatLevel(row, disc) {
  if (!row || !disc) return null
  if (isBJJDisc(disc) && row.bjj_belt) {
    const belt = `${row.bjj_belt} Belt`
    const n = row.bjj_stripes || 0
    return n > 0 ? `${belt} — ${n} Stripe${n !== 1 ? 's' : ''}` : belt
  }
  return row.level || null
}


export default function Dashboard() {
  const { athlete, logout, refreshAthlete } = useAuth()
  const { t } = useLanguage()
  const [tab, setTab] = useState('overview')
  const [nav, setNav] = useState('home')
  const [screen, setScreen] = useState('dashboard') // dashboard | profile
  const [attendance, setAttendance] = useState([])
  const [progress, setProgress] = useState([])
  const [levelRows, setLevelRows] = useState([])
  const [ptBalance, setPtBalance] = useState(0)
  const [ptBookings, setPtBookings] = useState([])
  const [ptCoach, setPtCoach] = useState(null)
  const [ptCoachId, setPtCoachId] = useState(null)
  const [showPTBooking, setShowPTBooking] = useState(false)
  const [showCoachProfile, setShowCoachProfile] = useState(false)
  const [viewCoachId, setViewCoachId] = useState(null)
  const [viewCoachAssigned, setViewCoachAssigned] = useState(false)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isDark, setIsDark] = useState(() => localStorage.getItem('pf-theme') !== 'light')
  const [screenAnim, setScreenAnim] = useState('') // for page transitions

  const disciplines = athlete?._disciplines || []
  const initials = getInitials(athlete?.name)
  const daysLeft = daysUntil(athlete?.membership_expiration_date)
  const is10Day = athlete?.membership_duration === '10-days-2months'
  const isExpired = is10Day ? false : daysLeft <= 0
  const isExpiring = !isExpired && daysLeft > 0 && daysLeft <= 14

  const discNames = (() => {
    if (athlete?.discipline_ids?.length) return athlete.discipline_ids.map((id) => disciplines.find((d) => d.id === id)).filter(Boolean)
    if (athlete?.discipline_id) { const d = disciplines.find((x) => x.id === athlete.discipline_id); return d ? [d] : [] }
    return []
  })()

  const levelsByDiscId = (() => {
    const map = {}
    for (const r of levelRows) map[r.discipline_id] = r
    return map
  })()

  const loadData = useCallback(async () => {
    if (!athlete?.id) return
    setLoading(true)
    const [a, p, pt, pb, lv] = await Promise.all([
      supabase.from('attendance').select('*').eq('student_id', athlete.id).order('date', { ascending: false }),
      supabase.from('member_progress').select('*, coaches:evaluated_by(id, name)').eq('member_id', athlete.id).order('evaluated_at', { ascending: false }),
      supabase.from('personal_training_purchases').select('sessions_remaining, coach_id').eq('student_id', athlete.id).gt('sessions_remaining', 0),
      supabase.from('personal_training_bookings').select('*').eq('student_id', athlete.id).order('booking_date', { ascending: false }).limit(20),
      supabase.from('student_discipline_levels').select('discipline_id, level, bjj_belt, bjj_stripes').eq('student_id', athlete.id),
    ])
    setAttendance(a.data || [])
    setProgress(p.data || [])
    setPtBalance((pt.data || []).reduce((s, r) => s + (r.sessions_remaining || 0), 0))
    setPtBookings(pb.data || [])
    setLevelRows(lv.data || [])

    if (pt.data?.length && pt.data[0].coach_id) {
      let { data: c } = await supabase.from('coaches').select('id, name').eq('id', pt.data[0].coach_id).maybeSingle()
      setPtCoach(c?.name || null)
      setPtCoachId(c?.id || null)
    }
    setLoading(false)
  }, [athlete?.id])

  useEffect(() => { loadData() }, [loadData])

  // Theme toggle
  function switchTheme() {
    const app = document.getElementById('pf-app')
    app?.classList.add('theme-switching')
    const next = isDark ? 'light' : 'dark'
    setIsDark(!isDark)
    document.body.style.background = next === 'light' ? '#F5F6FA' : '#0B0E14'
    localStorage.setItem('pf-theme', next)
    setTimeout(() => app?.classList.remove('theme-switching'), 400)
  }

  // Navigation with animation
  function navTo(t) {
    if (screen === 'profile') {
      setScreenAnim('slide-out-right')
      setTimeout(() => {
        setScreen('dashboard')
        setTab(t === 'home' ? 'overview' : t)
        setNav(t)
        setScreenAnim('slide-in-right')
        setTimeout(() => setScreenAnim(''), 300)
      }, 200)
    } else {
      setTab(t === 'home' ? 'overview' : t)
      setNav(t)
    }
  }

  function goProfile() {
    setScreenAnim('slide-in-left')
    setScreen('profile')
    setNav('profile')
    setTimeout(() => setScreenAnim(''), 300)
  }

  function goBack() {
    setScreenAnim('slide-out-right')
    setTimeout(() => {
      setScreen('dashboard')
      setNav('home')
      setScreenAnim('slide-in-right')
      setTimeout(() => setScreenAnim(''), 300)
    }, 200)
  }

  // Attendance calc
  const now = new Date()
  const thisMonthAtt = attendance.filter((a) => {
    if (!a.date) return false
    const d = new Date(a.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const presentCount = attendance.filter((a) => a.present).length
  const attRate = attendance.length ? Math.round((presentCount / attendance.length) * 100) : 0

  // 10-day pass
  const uniqueDates = new Set(attendance.filter((a) => a.present).map((a) => a.date?.split('T')[0])).size
  const daysUsed10 = is10Day ? uniqueDates : 0
  const daysLeft10 = is10Day ? Math.max(0, 10 - daysUsed10) : 0

  const TABS = [
    { id: 'overview', label: t('tabs.overview') },
    { id: 'attendance', label: t('tabs.attendance') },
    { id: 'progress', label: t('tabs.progress') },
    { id: 'workouts', label: t('tabs.workouts') },
    { id: 'pt', label: t('tabs.pt') },
    { id: 'coaches', label: t('tabs.coaches') },
  ]

  return (
    <div className="app" id="pf-app" data-theme={isDark ? 'dark' : 'light'}>
      {/* ── Top Bar ── */}
      <div className="topbar">
        <div className="topbar-left">
          {screen === 'profile' ? (
            <>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} onClick={goBack}>
                {Icons.back}
              </button>
              <span className="brand-text" style={{ fontSize: 15 }}>{t('common.profile')}</span>
            </>
          ) : (
            <img src="/primal-fitness-logo_transparent.png" alt="Primal Fitness" className="brand-logo" />
          )}
        </div>
        <div className="topbar-right">
          <LanguageSwitcher />
          <button className="theme-toggle-btn" onClick={switchTheme} title={isDark ? t('common.switchToLight') : t('common.switchToDark')}>
            {isDark ? Icons.sun : Icons.moon}
          </button>
          {screen === 'profile' ? (
            <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 11 }} onClick={() => setShowProfileEdit(true)}>{t('common.edit')}</button>
          ) : (
            <>
              <button
                className="btn-outline"
                style={{ padding: '6px 12px', fontSize: 11 }}
                onClick={() => setShowFeedback(true)}
                title={t('common.feedback')}
                aria-label={t('common.feedback')}
              >
                {t('common.feedback')}
              </button>
              <NotificationBell athleteId={athlete?.id} />
              <div className="avatar-btn" onClick={goProfile}>{initials}</div>
            </>
          )}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="main-content">
        <div className={`scroll-area ${screenAnim}`}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '64px 0', color: 'var(--pf-text3)', fontSize: 13 }}>
              <div className="spinner" />
              {t('common.loading')}
            </div>
          ) : screen === 'profile' ? (
            <ProfileScreen
              athlete={athlete}
              disciplines={discNames}
              levelsByDiscId={levelsByDiscId}
              initials={initials}
              isExpired={isExpired}
              isExpiring={isExpiring}
              daysLeft={daysLeft}
              switchTheme={switchTheme}
              isDarkTheme={isDark}
              logout={logout}
            />
          ) : (
            <>
              {/* Profile Header */}
              <div className="profile-header">
                <div className="profile-avatar">
                  {(athlete?.photo_url || athlete?.photo) ? <img src={athlete.photo_url || athlete.photo} alt="" /> : initials}
                </div>
                <div className="profile-info">
                  <h2>{athlete?.name}</h2>
                  <div className="profile-meta">
                    <StatusBadge isExpired={isExpired} isExpiring={isExpiring} />
                    {discNames.map((d) => <DiscBadge key={d.id} disc={d} />)}
                  </div>
                </div>
              </div>

              {/* Tab Bar */}
              <div className="tab-bar">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => { setTab(t.id); setNav(t.id === 'overview' ? 'home' : t.id) }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="tab-content fade-in" key={tab}>
                {tab === 'overview' && (
                  <OverviewTab
                    athlete={athlete}
                    daysLeft={is10Day ? daysLeft10 : Math.max(0, daysLeft)}
                    is10Day={is10Day}
                    daysUsed10={daysUsed10}
                    attRate={attRate}
                    thisMonthAtt={thisMonthAtt}
                    discNames={discNames}
                    disciplines={disciplines}
                    attendance={attendance}
                    levelsByDiscId={levelsByDiscId}
                  />
                )}
                {tab === 'attendance' && <AttendanceTab attendance={attendance} disciplines={disciplines} discNames={discNames} />}
                {tab === 'progress' && <ProgressTab progress={progress} disciplines={disciplines} onViewCoach={(coachId) => { setViewCoachId(coachId); setViewCoachAssigned(coachId === ptCoachId); setShowCoachProfile(true) }} />}
                {tab === 'workouts' && <WorkoutsTab athlete={athlete} disciplines={disciplines} />}
                {tab === 'pt' && <PTTab ptBalance={ptBalance} ptBookings={ptBookings} ptCoach={ptCoach} ptCoachId={ptCoachId} athlete={athlete} onBook={() => setShowPTBooking(true)} onCancelled={loadData} onViewCoach={ptCoachId ? () => { setViewCoachId(ptCoachId); setViewCoachAssigned(true); setShowCoachProfile(true) } : undefined} />}
                {tab === 'coaches' && <CoachesTab ptCoachId={ptCoachId} branchId={athlete?.branch_id} onViewCoach={(id) => { setViewCoachId(id); setViewCoachAssigned(id === ptCoachId); setShowCoachProfile(true) }} />}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom Navigation ── */}
      <div className="bottom-nav">
        {[
          { id: 'home', icon: Icons.home, label: t('nav.home') },
          { id: 'workouts', icon: Icons.schedule, label: t('nav.schedule') },
          { id: 'progress', icon: Icons.progress, label: t('nav.progress') },
          { id: 'profile', icon: Icons.profile, label: t('nav.profile') },
        ].map((item) => {
          const active = item.id === 'profile' ? screen === 'profile' : nav === item.id && screen === 'dashboard'
          return (
            <button
              key={item.id}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={item.id === 'profile' ? goProfile : () => navTo(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Modals ── */}
      <PTBookingDialog athlete={athlete} open={showPTBooking} onClose={() => setShowPTBooking(false)} onBooked={loadData} />
      <CoachProfileDialog coachId={viewCoachId} isAssigned={viewCoachAssigned} open={showCoachProfile} onClose={() => setShowCoachProfile(false)} />
      <ProfileEditDialog athlete={athlete} open={showProfileEdit} onClose={() => setShowProfileEdit(false)} onSaved={refreshAthlete} />
      <FeedbackDialog athlete={athlete} open={showFeedback} onClose={() => setShowFeedback(false)} />
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   REUSABLE PIECES
   ════════════════════════════════════════════════════════ */

function StatusBadge({ isExpired, isExpiring }) {
  const { t } = useLanguage()
  if (isExpired) return <span className="badge badge-expired">{t('status.expired')}</span>
  if (isExpiring) return <span className="badge badge-expiring">{t('status.expiring')}</span>
  return <span className="badge badge-active">{t('status.active')}</span>
}

function DiscBadge({ disc }) {
  const c = disc.color || '#64748B'
  return (
    <span className="badge badge-disc" style={{ background: c + '20', color: c, borderColor: c + '33' }}>
      {disc.name}
    </span>
  )
}

function DisciplineLevelsCard({ discNames, levelsByDiscId }) {
  const { t } = useLanguage()
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{t('overview.yourLevels')}</span>
        <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{t('overview.byDiscipline')}</span>
      </div>
      <div className="card-body">
        {discNames.map((d) => {
          const row = levelsByDiscId?.[d.id]
          const label = formatLevel(row, d) || t('common.notRatedYet')
          const c = d.color || '#64748B'
          return (
            <div key={d.id} className="detail-row">
              <span className="detail-key" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 6,
                    fontSize: 12, fontWeight: 700, background: c + '20', color: c,
                  }}
                >
                  {d.name}
                </span>
              </span>
              <span className="detail-val">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Empty({ text }) {
  return <div className="empty-state">{text}</div>
}

/* ════════════════════════════════════════════════════════
   OVERVIEW TAB
   ════════════════════════════════════════════════════════ */
function OverviewTab({ athlete, daysLeft, is10Day, daysUsed10, attRate, thisMonthAtt, discNames, disciplines, attendance, levelsByDiscId }) {
  const { t } = useLanguage()
  const ratedDiscs = discNames.filter((d) => !/gym access/i.test(d.name || ''))
  return (
    <>
      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-label">{t('overview.daysRemaining')}</div>
          <div className="stat-value">{daysLeft}</div>
          <div className="stat-sub">{athlete?.membership_expiration_date ? t('overview.expiresOn', { date: formatDate(athlete.membership_expiration_date) }) : t('common.noMembership')}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">{t('overview.attendanceRate')}</div>
          <div className="stat-value">{attRate}%</div>
          <div className="stat-sub">{t('overview.thisMonth')}</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">{is10Day ? t('overview.tenDayPass') : t('overview.checkIns')}</div>
          <div className="stat-value">{is10Day ? `${daysUsed10}/10` : thisMonthAtt.length}</div>
          <div className="stat-sub">{is10Day ? `${10 - daysUsed10} ${t('overview.sessionsLeft')}` : t('overview.thisMonth')}</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">{t('overview.disciplines')}</div>
          <div className="stat-value" style={discNames.length > 2 ? { fontSize: 16 } : {}}>
            {discNames.length > 0 ? discNames.map((d) => d.name).join(', ') : '-'}
          </div>
          <div className="stat-sub">{t('overview.enrolled', { count: discNames.length })}</div>
        </div>
      </div>

      {/* Discipline Levels */}
      {ratedDiscs.length > 0 && (
        <DisciplineLevelsCard discNames={ratedDiscs} levelsByDiscId={levelsByDiscId} />
      )}

      {/* Member Details */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('overview.memberDetails')}</span>
          <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{athlete?.category || 'Adults'}</span>
        </div>
        <div className="card-body">
          <div className="detail-row"><span className="detail-key">{t('overview.memberSince')}</span><span className="detail-val">{formatDate(athlete?.membership_date || athlete?.created_at)}</span></div>
          <div className="detail-row"><span className="detail-key">{t('overview.expiration')}</span><span className="detail-val">{formatDate(athlete?.membership_expiration_date)}</span></div>
          <div className="detail-row"><span className="detail-key">{t('overview.phone')}</span><span className="detail-val">{athlete?.phone_number || '-'}</span></div>
          <div className="detail-row"><span className="detail-key">{t('overview.email')}</span><span className="detail-val link">{athlete?.email || '-'}</span></div>
        </div>
      </div>

      {/* Recent Attendance */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('overview.recentAttendance')}</span>
          <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{t('overview.last10')}</span>
        </div>
        <div className="card-body">
          {attendance.length === 0 ? <Empty text={t('overview.noAttendance')} /> : (
            attendance.slice(0, 10).map((a, i) => (
              <div key={a.id || i} className="attendance-row">
                <div>
                  <div className="att-date">{formatDate(a.date)}</div>
                  <div className="att-time">
                    {a.class_name || (a.discipline_id ? discName(a.discipline_id, disciplines) : '')}
                    {a.time ? ` — ${a.time}` : ''}
                  </div>
                </div>
                <span className={`att-status ${a.present ? 'att-present' : 'att-absent'}`}>
                  {a.present ? t('status.present') : t('status.absent')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

/* ════════════════════════════════════════════════════════
   ATTENDANCE TAB
   ════════════════════════════════════════════════════════ */
function AttendanceTab({ attendance, disciplines, discNames }) {
  const { t } = useLanguage()
  const present = attendance.filter((a) => a.present)

  // Group present attendance by discipline_id
  const counts = {}
  present.forEach((a) => {
    const id = a.discipline_id || 'unknown'
    counts[id] = (counts[id] || 0) + 1
  })

  // Build rows: prefer enrolled disciplines first, then any other discipline_ids found in attendance
  const rows = []
  const seen = new Set()
  discNames.forEach((d) => {
    rows.push({ id: d.id, name: d.name, color: d.color || '#64748B', count: counts[d.id] || 0 })
    seen.add(d.id)
  })
  Object.keys(counts).forEach((id) => {
    if (seen.has(id)) return
    const d = disciplines.find((x) => x.id === id)
    rows.push({ id, name: d?.name || t('days.other'), color: d?.color || '#64748B', count: counts[id] })
  })

  const total = present.length
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-label">{t('attendance.totalClasses')}</div>
          <div className="stat-value">{total}</div>
          <div className="stat-sub">{t('attendance.allTime')}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">{t('attendance.disciplinesCount')}</div>
          <div className="stat-value">{rows.filter((r) => r.count > 0).length}</div>
          <div className="stat-sub">{t('attendance.withAttendance')}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('attendance.classesByDiscipline')}</span>
        </div>
        <div className="card-body">
          {rows.length === 0 ? (
            <Empty text={t('overview.noAttendance')} />
          ) : (
            rows.map((r) => (
              <div key={r.id} className="progress-item">
                <div className="progress-label">
                  <span
                    className="progress-name"
                    style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      background: r.color + '20',
                      color: r.color,
                    }}
                  >
                    {r.name}
                  </span>
                  <span className="progress-val">
                    {r.count} {r.count !== 1 ? t('attendance.classes') : t('attendance.class')}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(r.count / max) * 100}%`, background: r.color }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('attendance.recentClasses')}</span>
          <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{t('attendance.last15')}</span>
        </div>
        <div className="card-body">
          {present.length === 0 ? (
            <Empty text={t('attendance.noneYet')} />
          ) : (
            present.slice(0, 15).map((a, i) => {
              const disc = disciplines.find((d) => d.id === a.discipline_id)
              const color = disc?.color || '#64748B'
              return (
                <div key={a.id || i} className="attendance-row">
                  <div>
                    <div className="att-date">{formatDate(a.date)}</div>
                    <div className="att-time">
                      {a.class_name || disc?.name || ''}
                      {a.time ? ` — ${a.time}` : ''}
                    </div>
                  </div>
                  {disc && (
                    <span
                      className="badge badge-disc"
                      style={{ background: color + '20', color, borderColor: color + '33' }}
                    >
                      {disc.name}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}

/* ════════════════════════════════════════════════════════
   GYMNASTICS / PARKOUR — structured entry renderer
   ════════════════════════════════════════════════════════ */
function GymParkourProgressEntry({ entry, discColor, coachName, coachId, onViewCoach }) {
  const data = entry.progress_data || {}
  const { earned, max, pct, level } = computeGymParkourScore(data)

  // Pull rated items per section, skipping null/empty so the athlete sees only
  // what the coach actually evaluated.
  const flex = GYM_PARKOUR_CONFIG.flexibility.items
    .map((it) => ({ ...it, value: data[it.key] }))
    .filter((it) => it.value === 'weak' || it.value === 'good' || it.value === 'excellent')
  const strength = GYM_PARKOUR_CONFIG.strength.items
    .map((it) => ({ ...it, value: data[it.key] }))
    .filter((it) => typeof it.value === 'number' && !isNaN(it.value))
  const skills = GYM_PARKOUR_CONFIG.skills.items
    .map((it) => ({ ...it, value: data[it.key] }))
    .filter((it) => it.value === true || it.value === false)

  const dateStr = formatDate(entry.evaluated_at)
  const accent = discColor || 'var(--pf-blue-light)'

  return (
    <div>
      {/* Flexibility — colored chip per rated item */}
      {flex.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Flexibility</span>
            <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{dateStr}</span>
          </div>
          <div className="card-body">
            {flex.map((it) => {
              const meta = FLEX_META[it.value]
              return (
                <div
                  key={it.key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid var(--pf-border)',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--pf-text)' }}>{it.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: meta.bg, color: meta.color, letterSpacing: 0.3,
                  }}>
                    {meta.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Strength — measurement values with units */}
      {strength.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Strength</span>
            <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{dateStr}</span>
          </div>
          <div className="card-body">
            {strength.map((it) => (
              <div
                key={it.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--pf-border)',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--pf-text)' }}>{it.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                  {it.value}
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--pf-text3)', marginLeft: 4, letterSpacing: 0.4 }}>
                    {(it.unit || '').toUpperCase()}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills — ✓ / ✗ pill per rated item */}
      {skills.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Skills</span>
            <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{dateStr}</span>
          </div>
          <div className="card-body">
            {skills.map((it) => {
              const ok = it.value === true
              return (
                <div
                  key={it.key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid var(--pf-border)',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--pf-text)' }}>{it.label}</span>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                    background: ok ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    color: ok ? 'var(--pf-green)' : 'var(--pf-red)',
                  }}>
                    {ok ? '✓' : '✗'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Final Evaluation summary */}
      {max > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Final Evaluation</span>
            <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>Auto-calculated</span>
          </div>
          <div className="card-body">
            <div style={{
              display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline',
              marginBottom: 10,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pf-text3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  Score
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--pf-text)' }}>
                  {earned}
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--pf-text3)' }}> / {max}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pf-text3)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  Percent
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>
                  {pct}%
                </div>
              </div>
              {level && (
                <span style={{
                  marginLeft: 'auto',
                  padding: '4px 12px', borderRadius: 20,
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
                  background: LEVEL_META[level].bg, color: LEVEL_META[level].color,
                }}>
                  {level}
                </span>
              )}
            </div>
            <div className="progress-bar" style={{ height: 8 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${accent}, ${accent}CC)`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {(entry.notes || coachName) && (
        <div className="coach-note">
          {entry.notes && <p>"{entry.notes}"</p>}
          <div className="coach-name">
            — <span className={coachId ? 'coach-link' : ''} onClick={coachId ? () => onViewCoach(coachId) : undefined}>{coachName}</span>
            {' · '}{formatDate(entry.evaluated_at)}
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   PROGRESS TAB
   ════════════════════════════════════════════════════════ */
function ProgressTab({ progress, disciplines, onViewCoach }) {
  const { t } = useLanguage()
  // Track which entries are expanded. All collapsed by default — newest is on
  // top of each discipline group so it's still one tap away.
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const toggleEntry = (id) => setExpandedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (!progress.length) return <Empty text={t('progress.noEvaluations')} />

  // Group progress entries by discipline
  const byDiscipline = {}
  progress.forEach((r) => {
    const dId = r.discipline_id || 'unknown'
    if (!byDiscipline[dId]) byDiscipline[dId] = []
    byDiscipline[dId].push(r)
  })

  return (
    <>
      {Object.entries(byDiscipline).map(([discId, entries]) => {
        const disc = disciplines.find((d) => d.id === discId)
        const discLabel = disc?.name || t('progress.general')
        const discColor = disc?.color || '#64748B'

        return (
          <div key={discId}>
            {/* Discipline header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
              <span style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: 6,
                fontSize: 12, fontWeight: 700, background: discColor + '20', color: discColor,
              }}>{discLabel}</span>
              <span style={{ fontSize: 11, color: 'var(--pf-text3)' }}>{entries.length} {entries.length !== 1 ? t('progress.evaluations') : t('progress.evaluation')}</span>
            </div>

            {entries.map((r) => {
              const isOpen = expandedIds.has(r.id)
              const coachName = r.coaches?.name || t('coaches.coachLabel')
              const coachId = r.coaches?.id

              return (
                <div key={r.id} style={{ marginBottom: 12 }}>
                  {/* Collapsible header — date + discipline + coach */}
                  <button
                    type="button"
                    onClick={() => toggleEntry(r.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '12px 14px',
                      background: 'var(--pf-surface)',
                      border: '1px solid var(--pf-border)',
                      borderLeft: `3px solid ${discColor}`,
                      borderRadius: isOpen ? 'var(--pf-radius) var(--pf-radius) 0 0' : 'var(--pf-radius)',
                      borderBottom: isOpen ? '1px solid var(--pf-border)' : '1px solid var(--pf-border)',
                      cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'inherit', color: 'inherit',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pf-text)' }}>
                        {formatDate(r.evaluated_at)} · {discLabel} progress rating
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--pf-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        by Coach {coachName}
                      </span>
                    </div>
                    {/* Chevron — rotates 90° when open */}
                    <span style={{
                      flexShrink: 0, width: 22, height: 22,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--pf-text3)',
                      transform: `rotate(${isOpen ? 90 : 0}deg)`,
                      transition: 'transform 0.2s ease',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  </button>

                  {/* Expanded body — full evaluation + coach note */}
                  {isOpen && (
                    <div style={{
                      padding: '12px 14px',
                      background: 'var(--pf-surface2)',
                      border: '1px solid var(--pf-border)',
                      borderTop: 'none',
                      borderRadius: '0 0 var(--pf-radius) var(--pf-radius)',
                    }}>
                      <ProgressEntryBody entry={r} discColor={discColor} coachName={coachName} coachId={coachId} onViewCoach={onViewCoach} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

/* Strip well-known section prefixes from a saved key, then snake_case → Title.
   Keys without a known prefix (e.g. BJJ "full_guard_top", "composure") fall
   straight through. Used to label rows in the generic progress renderer. */
function prettyFieldLabel(key) {
  const noPrefix = key.replace(/^(mob_|stab_|gym_|str_|cond_|bench_)/, '')
  return noPrefix
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/* Decide how to render a single field. Returns null for empty/unrated values
   so the row gets skipped — no more "mins secs" placeholders or blank rights.
   `weightUnit` only applies when the key is a strength field (str_*). */
function describeField(key, value, weightUnit) {
  if (value == null || value === '') return null

  // Time values (Fitness conditioning/benchmark) are saved as { mins, secs }.
  if (typeof value === 'object') {
    const m = Number(value.mins) || 0
    const s = Number(value.secs) || 0
    if (m === 0 && s === 0) return null
    return { kind: 'time', display: `${m}:${String(s).padStart(2, '0')}` }
  }

  if (typeof value === 'boolean') {
    return { kind: 'bool', display: value ? '✓' : '✗' }
  }

  if (typeof value !== 'number') {
    // String values (e.g. flex_rating "good") — render verbatim, capitalised.
    const s = String(value)
    return { kind: 'text', display: s.charAt(0).toUpperCase() + s.slice(1) }
  }

  // Numeric branches.
  if (key.startsWith('str_')) {
    return { kind: 'weight', display: `${value} ${(weightUnit || 'kg').toUpperCase()}` }
  }
  // Score sliders are saved on a 0–100 scale across all martial-arts disciplines
  // and Fitness mobility/stability/gymnastics sections. Anything ≤ 10 is treated
  // as a 0–10 score (older entries / behavioral rubrics) — bar still scales.
  const max = value <= 10 ? 10 : 100
  return { kind: 'score', display: `${value}/${max}`, pct: Math.min(100, (value / max) * 100) }
}

/* Entry body — dispatches between Gym/Parkour structured render and a per-section
   render driven by progressConfigs.js. Used inside the expanded panel. */
function ProgressEntryBody({ entry, discColor, coachName, coachId, onViewCoach }) {
  const { t } = useLanguage()
  const data = entry.progress_data || {}

  if (isGymParkourEntry(data)) {
    return (
      <GymParkourProgressEntry
        entry={entry}
        discColor={discColor}
        coachName={coachName}
        coachId={coachId}
        onViewCoach={onViewCoach}
      />
    )
  }

  const { _weightUnit, ...fields } = data
  const sections = getDisciplineSections(entry.discipline_id)
  const dateStr = formatDate(entry.evaluated_at)

  // Walk the configured sections in order, building a card per section that
  // has at least one rated value. Behavioral cards get the green bar accent;
  // every other section uses the discipline color so the visual stays unified.
  const renderedSections = []
  const usedKeys = new Set()
  if (sections) {
    for (const section of sections) {
      const rows = []
      for (const key of section.keys) {
        usedKeys.add(key)
        if (!(key in fields)) continue
        const meta = describeField(key, fields[key], _weightUnit)
        if (!meta) continue
        rows.push({ key, meta })
      }
      if (rows.length === 0) continue
      const isBehavioral = /behavioral/i.test(section.label)
      renderedSections.push({ label: section.label, rows, isBehavioral })
    }
  }

  // Any keys not covered by the config (schema drift, new attribute) — render
  // them in a final "Other" card so nothing gets silently dropped.
  const orphanRows = Object.entries(fields)
    .filter(([k]) => !usedKeys.has(k))
    .map(([k, v]) => ({ key: k, meta: describeField(k, v, _weightUnit) }))
    .filter((r) => r.meta !== null)
  if (orphanRows.length > 0) {
    // Fallback for unknown disciplines: split orphans into Technical/Behavioral
    // using the historic five-key behavioral list, mirroring the old generic render.
    if (!sections) {
      const behavioralKeys = ['composure', 'listening', 'focus', 'understanding', 'behavior']
      const tech = orphanRows.filter((r) => !behavioralKeys.includes(r.key))
      const beh = orphanRows.filter((r) => behavioralKeys.includes(r.key))
      if (tech.length > 0) renderedSections.push({ label: t('progress.technicalSkills'), rows: tech, isBehavioral: false })
      if (beh.length > 0)  renderedSections.push({ label: t('progress.behavioralSkills'), rows: beh, isBehavioral: true })
    } else {
      renderedSections.push({ label: 'Other', rows: orphanRows, isBehavioral: false })
    }
  }

  return (
    <div>
      {renderedSections.map((section) => (
        <div key={section.label} className="card">
          <div className="card-header">
            <span className="card-title">{section.label}</span>
            <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{dateStr}</span>
          </div>
          <div className="card-body">
            {section.rows.map(({ key, meta }) => (
              <div key={key} className="progress-item">
                <div className="progress-label">
                  <span className="progress-name">{prettyFieldLabel(key)}</span>
                  <span className="progress-val">{meta.display}</span>
                </div>
                {meta.kind === 'score' && (
                  <div className="progress-bar">
                    <div className={`progress-fill ${section.isBehavioral ? 'fill-green' : 'fill-blue'}`} style={{ width: `${meta.pct}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {(entry.notes || coachName) && (
        <div className="coach-note">
          {entry.notes && <p>"{entry.notes}"</p>}
          <div className="coach-name">
            — <span className={coachId ? 'coach-link' : ''} onClick={coachId ? () => onViewCoach(coachId) : undefined}>{coachName}</span>
            {' · '}{dateStr}
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   WORKOUTS TAB — live class schedule
   ════════════════════════════════════════════════════════ */
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function normalizeDay(v) {
  if (v == null) return ''
  if (typeof v === 'number') {
    // Accept both 0-6 (Sun-Sat) and 1-7 (Mon-Sun) conventions
    if (v >= 1 && v <= 7) return WEEK_DAYS[v - 1]
    if (v >= 0 && v <= 6) return WEEK_DAYS[(v + 6) % 7]
  }
  const s = String(v).trim().toLowerCase()
  return WEEK_DAYS.find((d) => d.toLowerCase() === s || d.toLowerCase().startsWith(s)) || String(v)
}

function formatTime12(hms) {
  if (!hms) return ''
  const [hStr, m = '00'] = String(hms).split(':')
  let h = parseInt(hStr, 10)
  if (isNaN(h)) return String(hms)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m.slice(0, 2)} ${ampm}`
}

function WorkoutsTab({ athlete, disciplines }) {
  const { t } = useLanguage()
  const CLASS_CATEGORIES = [
    { id: 'martial_arts_kids', label: t('workouts.martialKids') },
    { id: 'martial_arts_adults', label: t('workouts.martialAdults') },
    { id: 'fitness_kids', label: t('workouts.fitnessKids') },
    { id: 'fitness_adults', label: t('workouts.fitnessAdults') },
  ]
  const DAY_KEY_MAP = {
    Monday: 'monday', Tuesday: 'tuesday', Wednesday: 'wednesday', Thursday: 'thursday',
    Friday: 'friday', Saturday: 'saturday', Sunday: 'sunday',
  }
  const [schedule, setSchedule] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!athlete?.branch_id) { setSchedule([]); setLoading(false); return }
    let active = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('class_schedules')
        .select('*')
        .eq('branch_id', athlete.branch_id)
      if (!active) return
      setSchedule(data || [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [athlete?.branch_id])

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  const filtered = schedule.filter((c) => {
    if (c.is_active === false) return false
    if (filter === 'all') return true
    return c.category === filter
  })

  const byDay = {}
  filtered.forEach((c) => {
    const day = normalizeDay(c.day_of_week) || 'Other'
    ;(byDay[day] ||= []).push(c)
  })
  Object.values(byDay).forEach((arr) =>
    arr.sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
  )

  const todayIdx = WEEK_DAYS.indexOf(todayName)
  const orderedDays = todayIdx >= 0
    ? [...WEEK_DAYS.slice(todayIdx), ...WEEK_DAYS.slice(0, todayIdx)]
    : WEEK_DAYS
  const daysToShow = orderedDays.filter((d) => byDay[d]?.length)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: 'var(--pf-text3)', fontSize: 13 }}>
      <div className="spinner" /> {t('workouts.loadingSchedule')}
    </div>
  )

  if (!schedule.length) return <Empty text={t('workouts.noSchedule')} />

  return (
    <>
      <div className="schedule-filters">
        <button
          className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('workouts.allClasses')}
        </button>
        {CLASS_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`filter-chip ${filter === cat.id ? 'active' : ''}`}
            onClick={() => setFilter(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {daysToShow.length === 0 ? (
        <Empty text={t('workouts.noMatchingFilter')} />
      ) : (
        daysToShow.map((day) => {
          const isToday = day === todayName
          const dayLabel = DAY_KEY_MAP[day] ? t('days.' + DAY_KEY_MAP[day]) : day
          return (
            <div key={day} className="schedule-day">
              <div className={`day-header${isToday ? ' is-today' : ''}`}>
                <span className="day-name">{dayLabel}</span>
                {isToday && <span className="today-pill">{t('workouts.today')}</span>}
                <span className="day-count">
                  {byDay[day].length} {byDay[day].length !== 1 ? t('workouts.classes') : t('workouts.class')}
                </span>
              </div>
              <div className="class-list">
                {byDay[day].map((c) => {
                  const disc = disciplines.find((x) => x.id === c.discipline_id)
                  const color = disc?.color || '#64748B'
                  return (
                    <div key={c.id} className="class-card" style={{ '--class-accent': color }}>
                      <div className="class-time">
                        <div className="class-time-start">{formatTime12(c.start_time)}</div>
                        {c.end_time && <div className="class-time-end">{formatTime12(c.end_time)}</div>}
                      </div>
                      <div className="class-info">
                        <div className="class-name">{c.name || discName(c.discipline_id, disciplines) || 'Class'}</div>
                        <div className="class-meta">
                          {disc && (
                            <span
                              className="class-disc"
                              style={{ background: color + '22', color, borderColor: color + '33' }}
                            >
                              {disc.name}
                            </span>
                          )}
                          {c.coach && <span className="class-location">· {c.coach}</span>}
                          {c.location && <span className="class-location">· {c.location}</span>}
                          {c.capacity && <span className="class-location">· {c.capacity} {t('workouts.spots')}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </>
  )
}

/* ════════════════════════════════════════════════════════
   PT TAB
   ════════════════════════════════════════════════════════ */
function PTTab({ ptBalance, ptBookings, ptCoach, ptCoachId, athlete, onBook, onCancelled, onViewCoach }) {
  const { t } = useLanguage()
  const [cancelling, setCancelling] = useState(null)

  // Status keys must match every value the management/coach portals write to
  // `personal_training_bookings.status`. Coach approval writes "approved"
  // (DisciplineLayout.jsx handleAction), and the "awaiting_*" / "rejected"
  // values come from the two-sided completion + decline flows. A missing key
  // used to fall through to the `cancelled` fallback — turning approved
  // bookings into visually-cancelled ones on the athlete side.
  const statusMap = {
    pending:         { cls: 'status-pending',   label: t('pt.statusPending') },
    approved:        { cls: 'status-scheduled', label: t('pt.statusApproved') },
    scheduled:       { cls: 'status-scheduled', label: t('pt.statusApproved') },
    awaiting_coach:  { cls: 'status-pending',   label: t('pt.statusPending') },
    awaiting_member: { cls: 'status-pending',   label: t('pt.statusPending') },
    completed:       { cls: 'status-completed', label: t('pt.statusCompleted') },
    cancelled:       { cls: 'status-cancelled', label: t('pt.statusCancelled') },
    declined:        { cls: 'status-declined',  label: t('pt.statusDeclined') },
    rejected:        { cls: 'status-declined',  label: t('pt.statusDeclined') },
    no_show:         { cls: 'status-noshow',    label: t('pt.statusNoShow') },
  }

  // 3-hour cancellation cutoff. Computed against booking_date + booking_time
  // parsed as local time — the scheduling page stores booking_time as "HH:mm"
  // and the date as YYYY-MM-DD. Returns null when there's no time set (legacy
  // bookings): in that case we don't enforce the window, since we can't
  // compute it precisely.
  const CANCEL_CUTOFF_HOURS = 3
  function hoursUntilBooking(booking) {
    if (!booking?.booking_date || !booking?.booking_time) return null
    const start = new Date(`${booking.booking_date}T${booking.booking_time}`)
    if (isNaN(start.getTime())) return null
    return (start.getTime() - Date.now()) / 3600000
  }

  async function cancelBooking(booking) {
    const hours = hoursUntilBooking(booking)
    if (hours !== null && hours < CANCEL_CUTOFF_HOURS) {
      alert(t('pt.cancelTooLate', { hours: CANCEL_CUTOFF_HOURS }) || `Cancellations must be made at least ${CANCEL_CUTOFF_HOURS} hours before the session.`)
      return
    }
    if (!confirm(t('pt.confirmCancel'))) return
    setCancelling(booking.id)
    const { error } = await supabase.from('personal_training_bookings')
      .update({ status: 'cancelled' }).eq('id', booking.id)
    if (error) { alert(t('pt.errorPrefix') + error.message); setCancelling(null); return }
    if (booking.coach_id) {
      // Notify the coach (push)
      await sendNotification({
        recipientId: booking.coach_id,
        recipientType: 'coach',
        notificationType: 'pt_session_cancelled',
        title: t('pt.cancelNotifTitle'),
        message: t('pt.cancelNotifMessage', { name: athlete.name, date: booking.booking_date, time: booking.booking_time }),
        branchId: athlete.branch_id,
      })
    }
    // Confirm to the athlete (push)
    await sendNotification({
      recipientId: athlete.id,
      recipientType: 'athlete',
      notificationType: 'pt_session_cancelled',
      title: 'Session cancelled',
      message: `Your PT session on ${booking.booking_date} ${booking.booking_time} has been cancelled.`,
      branchId: athlete.branch_id,
    })
    setCancelling(null)
    onCancelled?.()
  }

  return (
    <>
      <div className="pt-balance">
        <div className="pt-count">{ptBalance}</div>
        <div>
          <div className="pt-label">{t('pt.sessionsRemaining')}</div>
          {ptCoach && (
            <div className="pt-sublabel">
              {t('pt.assignedCoach')}{' '}
              {onViewCoach ? (
                <span className="coach-link" onClick={onViewCoach}>{ptCoach}</span>
              ) : ptCoach}
            </div>
          )}
        </div>
      </div>

      <button className="btn-primary" onClick={onBook} style={{ marginBottom: 14 }}>{t('pt.bookSession')}</button>

      <div className="card">
        <div className="card-header"><span className="card-title">{t('pt.upcomingPast')}</span></div>
        <div className="card-body">
          {ptBookings.length === 0 ? <Empty text={t('pt.noBookings')} /> : (
            ptBookings.map((b) => {
              const s = statusMap[b.status] || statusMap.pending
              const isCancellableStatus = b.status === 'pending' || b.status === 'scheduled' || b.status === 'approved'
              const hours = hoursUntilBooking(b)
              // Inside the 3-hour cutoff → show the button but disable it,
              // so athletes see why they can't cancel instead of it silently
              // disappearing. Legacy bookings without a time (hours === null)
              // keep the old behaviour.
              const withinCutoff = hours !== null && hours < CANCEL_CUTOFF_HOURS && hours > -1 // only block for future/just-past slots
              const canCancel = isCancellableStatus
              return (
                <div key={b.id} className="booking-item">
                  <div className="booking-top">
                    <span className={`booking-coach${onViewCoach ? ' coach-link' : ''}`} onClick={onViewCoach}>{ptCoach || t('coaches.coachLabel')}</span>
                    <span className={`booking-status ${s.cls}`}>{s.label}</span>
                  </div>
                  <div className="booking-detail">
                    {formatDate(b.booking_date)} · {b.booking_time || '-'}{b.notes ? ` · ${b.notes}` : ''}
                  </div>
                  {canCancel && (
                    <>
                      <button
                        className="btn-danger-outline"
                        style={{ marginTop: 8, padding: '5px 12px', fontSize: 11, opacity: withinCutoff ? 0.5 : 1, cursor: withinCutoff ? 'not-allowed' : 'pointer' }}
                        onClick={() => cancelBooking(b)}
                        disabled={cancelling === b.id || withinCutoff}
                        title={withinCutoff ? (t('pt.cancelTooLate', { hours: CANCEL_CUTOFF_HOURS }) || `Cancellations must be made at least ${CANCEL_CUTOFF_HOURS} hours before the session.`) : undefined}
                      >
                        {cancelling === b.id ? t('pt.cancelling') : t('pt.cancelSession')}
                      </button>
                      {withinCutoff && (
                        <div style={{ fontSize: 11, color: '#D97706', marginTop: 4, fontWeight: 500 }}>
                          {t('pt.cancelTooLate', { hours: CANCEL_CUTOFF_HOURS }) || `Cancellations must be made at least ${CANCEL_CUTOFF_HOURS} hours before the session.`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <button className="btn-outline" style={{ width: '100%', marginTop: 4 }}>{t('pt.purchaseMore')}</button>
    </>
  )
}

/* ════════════════════════════════════════════════════════
   COACHES TAB
   ════════════════════════════════════════════════════════ */
function CoachesTab({ ptCoachId, branchId, onViewCoach }) {
  const { t } = useLanguage()
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)

  const roleLabel = (role) => {
    const r = (role || 'coach').replace(/-/g, ' ')
    if (r === 'head coach') return t('coaches.roleHeadCoach')
    if (r === 'assistant coach') return t('coaches.roleAssistantCoach')
    return t('coaches.roleCoach')
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const coachRoles = ['coach', 'assistant-coach', 'head-coach']
      const { data } = await supabase.from('coaches')
        .select('id, name, role, credentials, photo_url')
        .in('role', coachRoles)
        .order('name')
      setCoaches(data || [])
      setLoading(false)
    })()
  }, [branchId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: 'var(--pf-text3)', fontSize: 13 }}>
      <div className="spinner" /> {t('common.loading')}
    </div>
  )

  if (!coaches.length) return <Empty text={t('coaches.noCoaches')} />

  return (
    <div className="coach-grid">
      {coaches.map((c) => (
        <div key={c.id} className="coach-card" onClick={() => onViewCoach(c.id)}>
          <div className="coach-card-avatar">
            {c.photo_url ? <img src={c.photo_url} alt="" /> : c.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="coach-card-info">
            <div className="coach-card-name">
              {c.name}
              {c.id === ptCoachId && <span className="badge badge-active" style={{ fontSize: 9 }}>{t('coaches.yourCoach')}</span>}
            </div>
            <div className="coach-card-role">{roleLabel(c.role)}</div>
            {c.credentials && <div className="coach-card-credentials">{c.credentials}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════════════
   PROFILE SCREEN
   ════════════════════════════════════════════════════════ */
function ProfileScreen({ athlete, disciplines, levelsByDiscId, initials, isExpired, isExpiring, daysLeft, switchTheme, isDarkTheme, logout }) {
  const { t } = useLanguage()
  const ratedDiscs = (disciplines || []).filter((d) => !/gym access/i.test(d.name || ''))
  return (
    <>
      {/* Profile Top */}
      <div style={{ textAlign: 'center', padding: '20px 16px 0' }}>
        <div className="profile-avatar large" style={{ margin: '0 auto 10px' }}>
          {(athlete?.photo_url || athlete?.photo) ? <img src={athlete.photo_url || athlete.photo} alt="" /> : initials}
        </div>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 19, color: 'var(--pf-text)' }}>{athlete?.name}</h2>
        <div className="profile-meta" style={{ justifyContent: 'center', marginTop: 6 }}>
          <StatusBadge isExpired={isExpired} isExpiring={isExpiring} />
          {disciplines.map((d) => <DiscBadge key={d.id} disc={d} />)}
        </div>
      </div>

      <div style={{ padding: '14px 16px 20px' }}>
        {/* Membership Card */}
        <div className="membership-card">
          <div className="membership-type">{t('profileScreen.membership')}</div>
          <div className="membership-name">
            {disciplines.map((d) => d.name).join(' + ') || t('common.noActivePlan')}
          </div>
          <div className="membership-exp">
            {athlete?.membership_expiration_date
              ? `${t('profileScreen.expiresOn', { date: formatDate(athlete.membership_expiration_date) })} · ${t('profileScreen.daysLeft', { n: Math.max(0, daysLeft) })}`
              : t('common.noExpirationDate')}
          </div>
        </div>

        {/* Discipline Levels */}
        {ratedDiscs.length > 0 && (
          <DisciplineLevelsCard discNames={ratedDiscs} levelsByDiscId={levelsByDiscId} />
        )}

        {/* Personal Info */}
        <div className="card">
          <div className="card-header"><span className="card-title">{t('profileScreen.personalInfo')}</span></div>
          <div className="card-body">
            <div className="detail-row"><span className="detail-key">{t('profileScreen.fullName')}</span><span className="detail-val">{athlete?.name || '-'}</span></div>
            <div className="detail-row"><span className="detail-key">{t('profileScreen.dob')}</span><span className="detail-val">{formatDate(athlete?.date_of_birth)}</span></div>
            <div className="detail-row"><span className="detail-key">{t('profileScreen.email')}</span><span className="detail-val link">{athlete?.email || '-'}</span></div>
            <div className="detail-row"><span className="detail-key">{t('profileScreen.phone')}</span><span className="detail-val">{athlete?.phone_number || '-'}</span></div>
            <div className="detail-row"><span className="detail-key">{t('profileScreen.category')}</span><span className="detail-val">{athlete?.category || '-'}</span></div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card">
          <div className="card-header"><span className="card-title">{t('profileScreen.preferences')}</span></div>
          <div className="card-body">
            <div className="toggle-row">
              <span className="toggle-label">{t('profileScreen.darkMode')}</span>
              <button className={`toggle-switch ${isDarkTheme ? 'on' : ''}`} onClick={switchTheme} />
            </div>
          </div>
        </div>

        {/* Logout */}
        <button className="btn-danger-outline" onClick={logout} style={{ marginTop: 8 }}>{t('profileScreen.logOut')}</button>
      </div>
    </>
  )
}
