import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../context/LanguageContext'

export default function NotificationBell({ athleteId }) {
  const { t } = useLanguage()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!athleteId) return
    load()
    const ch = supabase.channel('notif-' + athleteId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${athleteId}` },
        (p) => setItems((prev) => [p.new, ...prev]))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [athleteId])

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function load() {
    const { data, error } = await supabase.from('notifications').select('*')
      .eq('recipient_id', athleteId)
      .order('created_at', { ascending: false }).limit(30)
    if (error) console.error('notifications load error', error)
    setItems(data || [])
  }

  async function markRead() {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const unread = items.filter((n) => !n.is_read).length

  function ago(d) {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (m < 1) return t('notifBell.now')
    if (m < 60) return t('notifBell.minutesAgo', { n: m })
    const h = Math.floor(m / 60)
    if (h < 24) return t('notifBell.hoursAgo', { n: h })
    return t('notifBell.daysAgo', { n: Math.floor(h / 24) })
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="notif-btn"
        onClick={() => { setOpen(!open); if (!open) markRead() }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && (
          <div className="notif-badge">{unread > 9 ? '9+' : unread}</div>
        )}
      </button>

      {open && (
        <div className="notif-panel" style={{ display: 'block', animation: 'fadeSlideDown 0.2s ease' }}>
          <div className="notif-header">
            <span className="notif-title">{t('notifBell.notifications')}</span>
            {unread > 0 && (
              <button className="notif-mark" onClick={markRead}>{t('notifBell.markAllRead')}</button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>{t('notifBell.none')}</div>
          ) : (
            items.map((n) => (
              <div key={n.id} className="notif-item">
                <div className={`notif-dot ${n.is_read ? 'read' : ''}`} />
                <div>
                  {n.title && <div className="notif-text" style={{ fontWeight: 600 }}>{n.title}</div>}
                  <div className="notif-text">{n.message}</div>
                  <div className="notif-time">{ago(n.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
