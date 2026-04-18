import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Sun, Moon } from 'lucide-react'


export default function Login() {
  const { login } = useAuth()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('pf-theme') !== 'light')
  const [step, setStep] = useState('credentials')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dob, setDob] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [member, setMember] = useState(null)

  async function onCredentials(e) {
    e.preventDefault(); setError(''); setLoading(true)
    const { data } = await supabase.from('students').select('*')
      .ilike('name', name.trim()).eq('phone_number', phone.trim()).maybeSingle()
    if (!data) { setError('No account found. Check your name and phone number.'); setLoading(false); return }
    const { data: discs } = await supabase.from('disciplines').select('*')
    data._disciplines = discs || []
    setMember(data)
    if (!data.password || !data.date_of_birth) { setStep('setPassword') }
    else { setStep('password') }
    setLoading(false)
  }

  async function onPassword(e) {
    e.preventDefault(); setError(''); setLoading(true)
    if (password !== member.password) { setError('Incorrect password.'); setLoading(false); return }
    login(member)
  }

  async function onSetPassword(e) {
    e.preventDefault(); setError('')
    if (newPassword.length < 4) { setError('Password must be at least 4 characters.'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    const updates = { password: newPassword }
    if (dob) updates.date_of_birth = dob
    const { error: err } = await supabase.from('students').update(updates).eq('id', member.id)
    if (err) { setError('Failed to set password. Try again.'); setLoading(false); return }
    member.password = newPassword
    if (dob) member.date_of_birth = dob
    login(member)
  }

  function goBack() {
    setStep('credentials'); setPassword(''); setNewPassword(''); setConfirmPassword('')
    setDob(''); setError(''); setMember(null)
  }

  function switchTheme() {
    const next = isDark ? 'light' : 'dark'
    setIsDark(!isDark)
    document.body.style.background = next === 'light' ? '#F5F6FA' : '#0B0E14'
    localStorage.setItem('pf-theme', next)
  }

  return (
    <div className="login-screen" data-theme={isDark ? 'dark' : 'light'}>
      {/* Theme Toggle */}
      <button
        className="theme-toggle-btn"
        onClick={switchTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{ position: 'absolute', top: 20, right: 20 }}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Card */}
      <form
        className="login-card"
        onSubmit={step === 'credentials' ? onCredentials : step === 'password' ? onPassword : onSetPassword}
      >
        {/* Logo inside card */}
        <div className="login-logo">
          <img src="/primal-fitness-logo.png" alt="Primal Fitness" style={{ width: 180, height: 'auto', marginBottom: 6 }} />
          <div className="login-sub">Athletes Portal</div>
        </div>
        <div className="step-dots">
          <div className={`dot ${step === 'credentials' ? 'active' : ''}`} />
          <div className={`dot ${step !== 'credentials' ? 'active' : ''}`} />
        </div>

        <div className="login-title">
          {step === 'credentials' && 'Welcome back'}
          {step === 'password' && `Welcome back, ${member?.name?.split(' ')[0]}`}
          {step === 'setPassword' && 'Set up your account'}
        </div>

        {error && <div className="alert-error">{error}</div>}

        {/* Step 1: Credentials */}
        {step === 'credentials' && (
          <>
            <div className="form-group">
              <label className="form-label">Full name</label>
              <input className="form-input" type="text" placeholder="Enter your name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Phone number</label>
              <input className="form-input" type="tel" placeholder="+971 XX XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </>
        )}

        {/* Step 2: Password */}
        {step === 'password' && (
          <>
            <button type="button" onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#8B93A7', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8B93A7' }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Set password */}
        {step === 'setPassword' && (
          <>
            <button type="button" onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#8B93A7', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            {!member?.date_of_birth && (
              <div className="form-group">
                <label className="form-label">Date of birth</label>
                <input className="form-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="At least 4 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8B93A7' }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Confirm password</label>
              <input className="form-input" type="password" placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          </>
        )}

        <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 6 }}>
          {loading ? 'Please wait...' : step === 'credentials' ? 'Continue' : step === 'password' ? 'Sign In' : 'Create Account'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#8B93A7', marginTop: 14 }}>
          {step === 'credentials' ? 'Enter the name and phone registered with Primal Fitness' : step === 'setPassword' ? 'You can set a password to secure your account' : ''}
        </p>
      </form>
    </div>
  )
}
