import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDate, daysUntil, getInitials } from '../lib/helpers'
import NotificationBell from '../components/NotificationBell'
import PTBookingDialog from '../components/PTBookingDialog'
import CoachProfileDialog from '../components/CoachProfileDialog'
import ProfileEditDialog from '../components/ProfileEditDialog'
import FeedbackDialog from '../components/FeedbackDialog'

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
    { id: 'overview', label: 'Overview' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'progress', label: 'Progress' },
    { id: 'workouts', label: 'Workouts' },
    { id: 'pt', label: 'Personal training' },
    { id: 'coaches', label: 'Coaches' },
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
              <span className="brand-text" style={{ fontSize: 15 }}>Profile</span>
            </>
          ) : (
            <img src="/primal-fitness-logo_transparent.png" alt="Primal Fitness" className="brand-logo" />
          )}
        </div>
        <div className="topbar-right">
          <button className="theme-toggle-btn" onClick={switchTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? Icons.sun : Icons.moon}
          </button>
          {screen === 'profile' ? (
            <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 11 }} onClick={() => setShowProfileEdit(true)}>Edit</button>
          ) : (
            <>
              <button
                className="btn-outline"
                style={{ padding: '6px 12px', fontSize: 11 }}
                onClick={() => setShowFeedback(true)}
                title="Feedback"
                aria-label="Feedback"
              >
                Feedback
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
              Loading...
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
                  {athlete?.photo ? <img src={athlete.photo} alt="" /> : initials}
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
          { id: 'home', icon: Icons.home, label: 'Home' },
          { id: 'workouts', icon: Icons.schedule, label: 'Schedule' },
          { id: 'progress', icon: Icons.progress, label: 'Progress' },
          { id: 'profile', icon: Icons.profile, label: 'Profile' },
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
  if (isExpired) return <span className="badge badge-expired">Expired</span>
  if (isExpiring) return <span className="badge badge-expiring">Expiring</span>
  return <span className="badge badge-active">Active</span>
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
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Your levels</span>
        <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>By discipline</span>
      </div>
      <div className="card-body">
        {discNames.map((d) => {
          const row = levelsByDiscId?.[d.id]
          const label = formatLevel(row, d) || 'Not rated yet'
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
  const ratedDiscs = discNames.filter((d) => !/gym access/i.test(d.name || ''))
  return (
    <>
      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-label">Days remaining</div>
          <div className="stat-value">{daysLeft}</div>
          <div className="stat-sub">{athlete?.membership_expiration_date ? `Expires ${formatDate(athlete.membership_expiration_date)}` : 'No membership'}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Attendance rate</div>
          <div className="stat-value">{attRate}%</div>
          <div className="stat-sub">This month</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">{is10Day ? '10-day pass' : 'Check-ins'}</div>
          <div className="stat-value">{is10Day ? `${daysUsed10}/10` : thisMonthAtt.length}</div>
          <div className="stat-sub">{is10Day ? `${10 - daysUsed10} sessions left` : 'This month'}</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">Disciplines</div>
          <div className="stat-value" style={discNames.length > 2 ? { fontSize: 16 } : {}}>
            {discNames.length > 0 ? discNames.map((d) => d.name).join(', ') : '-'}
          </div>
          <div className="stat-sub">{`${discNames.length} enrolled`}</div>
        </div>
      </div>

      {/* Discipline Levels */}
      {ratedDiscs.length > 0 && (
        <DisciplineLevelsCard discNames={ratedDiscs} levelsByDiscId={levelsByDiscId} />
      )}

      {/* Member Details */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Member details</span>
          <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{athlete?.category || 'Adults'}</span>
        </div>
        <div className="card-body">
          <div className="detail-row"><span className="detail-key">Member since</span><span className="detail-val">{formatDate(athlete?.membership_date || athlete?.created_at)}</span></div>
          <div className="detail-row"><span className="detail-key">Expiration</span><span className="detail-val">{formatDate(athlete?.membership_expiration_date)}</span></div>
          <div className="detail-row"><span className="detail-key">Phone</span><span className="detail-val">{athlete?.phone_number || '-'}</span></div>
          <div className="detail-row"><span className="detail-key">Email</span><span className="detail-val link">{athlete?.email || '-'}</span></div>
        </div>
      </div>

      {/* Recent Attendance */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent attendance</span>
          <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>Last 10</span>
        </div>
        <div className="card-body">
          {attendance.length === 0 ? <Empty text="No attendance records yet." /> : (
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
                  {a.present ? 'Present' : 'Absent'}
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
    rows.push({ id, name: d?.name || 'Other', color: d?.color || '#64748B', count: counts[id] })
  })

  const total = present.length
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-label">Total classes attended</div>
          <div className="stat-value">{total}</div>
          <div className="stat-sub">All time</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Disciplines</div>
          <div className="stat-value">{rows.filter((r) => r.count > 0).length}</div>
          <div className="stat-sub">With attendance</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Classes attended by discipline</span>
        </div>
        <div className="card-body">
          {rows.length === 0 ? (
            <Empty text="No attendance records yet." />
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
                    {r.count} class{r.count !== 1 ? 'es' : ''}
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
          <span className="card-title">Recent classes</span>
          <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>Last 15</span>
        </div>
        <div className="card-body">
          {present.length === 0 ? (
            <Empty text="No classes attended yet." />
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
   PROGRESS TAB
   ════════════════════════════════════════════════════════ */
function ProgressTab({ progress, disciplines, onViewCoach }) {
  if (!progress.length) return <Empty text="No progress evaluations yet. Your coach will update your progress here." />

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
        const discLabel = disc?.name || 'General'
        const discColor = disc?.color || '#64748B'

        return (
          <div key={discId}>
            {/* Discipline header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
              <span style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: 6,
                fontSize: 12, fontWeight: 700, background: discColor + '20', color: discColor,
              }}>{discLabel}</span>
              <span style={{ fontSize: 11, color: 'var(--pf-text3)' }}>{entries.length} evaluation{entries.length !== 1 ? 's' : ''}</span>
            </div>

            {entries.map((r) => {
              const data = r.progress_data || {}
              const { _weightUnit, ...fields } = data
              const allEntries = Object.entries(fields)
              // Separate behavioral keys from technical
              const behavioralKeys = ['composure', 'listening', 'focus', 'understanding', 'behavior']
              const tech = allEntries.filter(([k]) => !behavioralKeys.includes(k))
              const behavioral = allEntries.filter(([k]) => behavioralKeys.includes(k))
              const coachName = r.coaches?.name || 'Coach'
              const coachId = r.coaches?.id

              return (
                <div key={r.id}>
                  {tech.length > 0 && (
                    <div className="card">
                      <div className="card-header">
                        <span className="card-title">Technical skills</span>
                        <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{formatDate(r.evaluated_at)}</span>
                      </div>
                      <div className="card-body">
                        {tech.map(([name, value]) => {
                          const numVal = typeof value === 'number' ? value : parseFloat(value)
                          const isScore = !isNaN(numVal) && numVal <= 10
                          const displayVal = typeof value === 'object' && value !== null
                            ? Object.entries(value).map(([k, v]) => `${v}${k}`).join(' ')
                            : value
                          return (
                            <div key={name} className="progress-item">
                              <div className="progress-label">
                                <span className="progress-name" style={{ textTransform: 'capitalize' }}>{name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="progress-val">{isScore ? `${numVal}/10` : displayVal}{_weightUnit && typeof value === 'number' && !isScore ? ` ${_weightUnit}` : ''}</span>
                              </div>
                              {isScore && (
                                <div className="progress-bar">
                                  <div className="progress-fill fill-blue" style={{ width: `${numVal * 10}%` }} />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {behavioral.length > 0 && (
                    <div className="card">
                      <div className="card-header">
                        <span className="card-title">Behavioral skills</span>
                        <span style={{ fontSize: 10, color: 'var(--pf-text3)' }}>{formatDate(r.evaluated_at)}</span>
                      </div>
                      <div className="card-body">
                        {behavioral.map(([name, value]) => {
                          const numVal = typeof value === 'number' ? value : parseFloat(value)
                          return (
                            <div key={name} className="progress-item">
                              <div className="progress-label">
                                <span className="progress-name" style={{ textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
                                <span className="progress-val">{numVal}/10</span>
                              </div>
                              <div className="progress-bar">
                                <div className="progress-fill fill-green" style={{ width: `${numVal * 10}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {(r.notes || coachName) && (
                    <div className="coach-note">
                      {r.notes && <p>"{r.notes}"</p>}
                      <div className="coach-name">
                        — <span className={coachId ? 'coach-link' : ''} onClick={coachId ? () => onViewCoach(coachId) : undefined}>{coachName}</span>
                        {' · '}{formatDate(r.evaluated_at)}
                      </div>
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

const CLASS_CATEGORIES = [
  { id: 'martial_arts_kids', label: 'Martial arts kids' },
  { id: 'martial_arts_adults', label: 'Martial arts adults' },
  { id: 'fitness_kids', label: 'Fitness kids' },
  { id: 'fitness_adults', label: 'Fitness adults' },
]

function WorkoutsTab({ athlete, disciplines }) {
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
      <div className="spinner" /> Loading schedule...
    </div>
  )

  if (!schedule.length) return <Empty text="No class schedule available yet." />

  return (
    <>
      <div className="schedule-filters">
        <button
          className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All classes
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
        <Empty text="No classes match this filter." />
      ) : (
        daysToShow.map((day) => {
          const isToday = day === todayName
          return (
            <div key={day} className="schedule-day">
              <div className={`day-header${isToday ? ' is-today' : ''}`}>
                <span className="day-name">{day}</span>
                {isToday && <span className="today-pill">Today</span>}
                <span className="day-count">
                  {byDay[day].length} class{byDay[day].length !== 1 ? 'es' : ''}
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
                          {c.capacity && <span className="class-location">· {c.capacity} spots</span>}
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
  const [cancelling, setCancelling] = useState(null)

  const statusMap = {
    pending: { cls: 'status-pending', label: 'Pending' },
    scheduled: { cls: 'status-scheduled', label: 'Approved' },
    completed: { cls: 'status-completed', label: 'Completed' },
    cancelled: { cls: 'status-cancelled', label: 'Cancelled' },
    declined: { cls: 'status-declined', label: 'Declined' },
    no_show: { cls: 'status-noshow', label: 'No Show' },
  }

  async function cancelBooking(booking) {
    if (!confirm('Are you sure you want to cancel this session?')) return
    setCancelling(booking.id)
    const { error } = await supabase.from('personal_training_bookings')
      .update({ status: 'cancelled' }).eq('id', booking.id)
    if (error) { alert('Error: ' + error.message); setCancelling(null); return }
    if (booking.coach_id) {
      await supabase.from('notifications').insert({
        recipient_type: 'coach', recipient_id: booking.coach_id, notification_type: 'pt_cancellation',
        title: 'PT Session Cancelled', message: `${athlete.name} cancelled their session on ${booking.booking_date} at ${booking.booking_time}`,
        related_entity_type: 'student', related_entity_id: athlete.id, branch_id: athlete.branch_id,
      })
    }
    setCancelling(null)
    onCancelled?.()
  }

  return (
    <>
      <div className="pt-balance">
        <div className="pt-count">{ptBalance}</div>
        <div>
          <div className="pt-label">PT sessions remaining</div>
          {ptCoach && (
            <div className="pt-sublabel">
              Assigned coach:{' '}
              {onViewCoach ? (
                <span className="coach-link" onClick={onViewCoach}>{ptCoach}</span>
              ) : ptCoach}
            </div>
          )}
        </div>
      </div>

      <button className="btn-primary" onClick={onBook} style={{ marginBottom: 14 }}>Book a session</button>

      <div className="card">
        <div className="card-header"><span className="card-title">Upcoming & past sessions</span></div>
        <div className="card-body">
          {ptBookings.length === 0 ? <Empty text="No PT sessions booked yet." /> : (
            ptBookings.map((b) => {
              const s = statusMap[b.status] || statusMap.cancelled
              const canCancel = b.status === 'pending' || b.status === 'scheduled'
              return (
                <div key={b.id} className="booking-item">
                  <div className="booking-top">
                    <span className={`booking-coach${onViewCoach ? ' coach-link' : ''}`} onClick={onViewCoach}>{ptCoach || 'Coach'}</span>
                    <span className={`booking-status ${s.cls}`}>{s.label}</span>
                  </div>
                  <div className="booking-detail">
                    {formatDate(b.booking_date)} · {b.booking_time || '-'}{b.notes ? ` · ${b.notes}` : ''}
                  </div>
                  {canCancel && (
                    <button
                      className="btn-danger-outline"
                      style={{ marginTop: 8, padding: '5px 12px', fontSize: 11 }}
                      onClick={() => cancelBooking(b)}
                      disabled={cancelling === b.id}
                    >
                      {cancelling === b.id ? 'Cancelling...' : 'Cancel session'}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <button className="btn-outline" style={{ width: '100%', marginTop: 4 }}>Purchase more sessions</button>
    </>
  )
}

/* ════════════════════════════════════════════════════════
   COACHES TAB
   ════════════════════════════════════════════════════════ */
function CoachesTab({ ptCoachId, branchId, onViewCoach }) {
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const coachRoles = ['coach', 'assistant-coach', 'head-coach']
      const { data } = await supabase.from('coaches')
        .select('id, name, role, credentials, photo')
        .in('role', coachRoles)
        .order('name')
      setCoaches(data || [])
      setLoading(false)
    })()
  }, [branchId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: 'var(--pf-text3)', fontSize: 13 }}>
      <div className="spinner" /> Loading...
    </div>
  )

  if (!coaches.length) return <Empty text="No coaches found." />

  return (
    <div className="coach-grid">
      {coaches.map((c) => (
        <div key={c.id} className="coach-card" onClick={() => onViewCoach(c.id)}>
          <div className="coach-card-avatar">
            {c.photo ? <img src={c.photo} alt="" /> : c.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="coach-card-info">
            <div className="coach-card-name">
              {c.name}
              {c.id === ptCoachId && <span className="badge badge-active" style={{ fontSize: 9 }}>Your coach</span>}
            </div>
            <div className="coach-card-role">{(c.role || 'coach').replace(/-/g, ' ')}</div>
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
  const ratedDiscs = (disciplines || []).filter((d) => !/gym access/i.test(d.name || ''))
  return (
    <>
      {/* Profile Top */}
      <div style={{ textAlign: 'center', padding: '20px 16px 0' }}>
        <div className="profile-avatar large" style={{ margin: '0 auto 10px' }}>
          {athlete?.photo ? <img src={athlete.photo} alt="" /> : initials}
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
          <div className="membership-type">Membership</div>
          <div className="membership-name">
            {disciplines.map((d) => d.name).join(' + ') || 'No active plan'}
          </div>
          <div className="membership-exp">
            {athlete?.membership_expiration_date
              ? `Expires ${formatDate(athlete.membership_expiration_date)} · ${Math.max(0, daysLeft)} days left`
              : 'No expiration date'}
          </div>
        </div>

        {/* Discipline Levels */}
        {ratedDiscs.length > 0 && (
          <DisciplineLevelsCard discNames={ratedDiscs} levelsByDiscId={levelsByDiscId} />
        )}

        {/* Personal Info */}
        <div className="card">
          <div className="card-header"><span className="card-title">Personal information</span></div>
          <div className="card-body">
            <div className="detail-row"><span className="detail-key">Full name</span><span className="detail-val">{athlete?.name || '-'}</span></div>
            <div className="detail-row"><span className="detail-key">Date of birth</span><span className="detail-val">{formatDate(athlete?.date_of_birth)}</span></div>
            <div className="detail-row"><span className="detail-key">Email</span><span className="detail-val link">{athlete?.email || '-'}</span></div>
            <div className="detail-row"><span className="detail-key">Phone</span><span className="detail-val">{athlete?.phone_number || '-'}</span></div>
            <div className="detail-row"><span className="detail-key">Category</span><span className="detail-val">{athlete?.category || '-'}</span></div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card">
          <div className="card-header"><span className="card-title">Preferences</span></div>
          <div className="card-body">
            <div className="toggle-row">
              <span className="toggle-label">Dark mode</span>
              <button className={`toggle-switch ${isDarkTheme ? 'on' : ''}`} onClick={switchTheme} />
            </div>
          </div>
        </div>

        {/* Logout */}
        <button className="btn-danger-outline" onClick={logout} style={{ marginTop: 8 }}>Log out</button>
      </div>
    </>
  )
}
