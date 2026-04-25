import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { subscribeToPush } from '../lib/pushManager'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [athlete, setAthlete] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('athlete-session')
    if (stored) {
      try {
        const session = JSON.parse(stored)
        loadAthlete(session.id)
      } catch {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  async function loadAthlete(memberId) {
    setLoading(true)
    const { data: member } = await supabase
      .from('students')
      .select('*')
      .eq('id', memberId)
      .maybeSingle()

    if (member) {
      // Load disciplines
      const { data: disciplines } = await supabase.from('disciplines').select('*')
      member._disciplines = disciplines || []

      setAthlete(member)
      localStorage.setItem('athlete-session', JSON.stringify({ id: member.id, name: member.name }))
      subscribeToPush(member.id, 'student').catch(() => {})
    } else {
      localStorage.removeItem('athlete-session')
    }
    setLoading(false)
  }

  function login(member) {
    setAthlete(member)
    localStorage.setItem('athlete-session', JSON.stringify({ id: member.id, name: member.name }))
    subscribeToPush(member.id, 'student').catch(() => {})
  }

  function logout() {
    setAthlete(null)
    localStorage.removeItem('athlete-session')
  }

  async function refreshAthlete() {
    if (athlete?.id) await loadAthlete(athlete.id)
  }

  return (
    <AuthContext.Provider value={{ athlete, loading, login, logout, refreshAthlete, loadAthlete }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
