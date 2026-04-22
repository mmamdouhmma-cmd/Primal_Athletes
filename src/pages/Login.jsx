import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Sun, Moon } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher'


export default function Login() {
  const { login } = useAuth()
  const { t } = useLanguage()
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
    const nameNorm = name.toLowerCase().replace(/\s+/g, ' ').trim()
    const phoneNorm = phone.replace(/\D/g, '').replace(/^(971|0)/, '')

    const { data: matches } = await supabase.from('students').select('*')
      .eq('name_normalized', nameNorm).eq('phone_normalized', phoneNorm)

    if (matches && matches.length > 0) {
      const data = matches[0]
      const { data: discs } = await supabase.from('disciplines').select('*')
      data._disciplines = discs || []
      setMember(data)
      if (!data.password || !data.date_of_birth) { setStep('setPassword') }
      else { setStep('password') }
      setLoading(false)
      return
    }

    const { data: nameMatches } = await supabase.from('students').select('id, phone_normalized')
      .eq('name_normalized', nameNorm)

    if (!nameMatches || nameMatches.length === 0) {
      setError(t('login.errNameNotInSystem'))
    } else if (nameMatches.some(m => m.phone_normalized && m.phone_normalized.length > 0)) {
      setError(t('login.errWrongPhone'))
    } else {
      setError(t('login.errPhoneNotRegistered'))
    }
    setLoading(false)
  }

  async function onPassword(e) {
    e.preventDefault(); setError(''); setLoading(true)
    if (password !== member.password) { setError(t('login.errIncorrectPassword')); setLoading(false); return }
    login(member)
  }

  async function onSetPassword(e) {
    e.preventDefault(); setError('')
    if (newPassword.length < 4) { setError(t('login.errPasswordTooShort')); return }
    if (newPassword !== confirmPassword) { setError(t('login.errPasswordsMismatch')); return }
    setLoading(true)
    const updates = { password: newPassword }
    if (dob) updates.date_of_birth = dob
    const { error: err } = await supabase.from('students').update(updates).eq('id', member.id)
    if (err) { setError(t('login.errSetPasswordFailed')); setLoading(false); return }
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
      {/* Top-right controls: language + theme */}
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <LanguageSwitcher />
        <button
          className="theme-toggle-btn"
          onClick={switchTheme}
          title={isDark ? t('common.switchToLight') : t('common.switchToDark')}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Card */}
      <form
        className="login-card"
        onSubmit={step === 'credentials' ? onCredentials : step === 'password' ? onPassword : onSetPassword}
      >
        {/* Logo inside card */}
        <div className="login-logo">
          <img src="/primal-fitness-logo.png" alt="Primal Fitness" style={{ width: 180, height: 'auto', marginBottom: 6 }} />
          <div className="login-sub">{t('login.athletesPortal')}</div>
        </div>
        <div className="step-dots">
          <div className={`dot ${step === 'credentials' ? 'active' : ''}`} />
          <div className={`dot ${step !== 'credentials' ? 'active' : ''}`} />
        </div>

        <div className="login-title">
          {step === 'credentials' && t('login.welcomeBack')}
          {step === 'password' && t('login.welcomeBackName', { name: member?.name?.split(' ')[0] || '' })}
          {step === 'setPassword' && t('login.setupAccount')}
        </div>

        {error && <div className="alert-error">{error}</div>}

        {/* Step 1: Credentials */}
        {step === 'credentials' && (
          <>
            <div className="form-group">
              <label className="form-label">{t('login.nameLabel')}</label>
              <input className="form-input" type="text" placeholder={t('login.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('login.phoneLabel')}</label>
              <input className="form-input" type="tel" placeholder={t('login.phonePlaceholder')} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </>
        )}

        {/* Step 2: Password */}
        {step === 'password' && (
          <>
            <button type="button" onClick={goBack} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#8B93A7', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              {t('login.back')}
            </button>
            <div className="form-group">
              <label className="form-label">{t('login.passwordLabel')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder={t('login.passwordPlaceholder')}
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
              {t('login.back')}
            </button>
            {!member?.date_of_birth && (
              <div className="form-group">
                <label className="form-label">{t('login.dobLabel')}</label>
                <input className="form-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{t('login.newPasswordLabel')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder={t('login.newPasswordPlaceholder')}
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
              <label className="form-label">{t('login.confirmPasswordLabel')}</label>
              <input className="form-input" type="password" placeholder={t('login.confirmPasswordPlaceholder')} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          </>
        )}

        <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 6 }}>
          {loading ? t('login.pleaseWait') : step === 'credentials' ? t('login.continue') : step === 'password' ? t('login.signIn') : t('login.createAccount')}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#8B93A7', marginTop: 14 }}>
          {step === 'credentials' ? t('login.hintCredentials') : step === 'setPassword' ? t('login.hintSetPassword') : ''}
        </p>
      </form>
    </div>
  )
}
