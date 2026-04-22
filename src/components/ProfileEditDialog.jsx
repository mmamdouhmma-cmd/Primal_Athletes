import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { uploadProfilePhoto } from '../lib/photoUpload'
import { getInitials } from '../lib/helpers'
import { useLanguage } from '../context/LanguageContext'

export default function ProfileEditDialog({ athlete, open, onClose, onSaved }) {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    if (open && athlete) {
      setEmail(athlete.email || '')
      setPhone(athlete.phone_number || '')
      setDob(athlete.date_of_birth || '')
      setOldPw(''); setNewPw(''); setError(''); setSuccess('')
      setPhotoPreview(athlete.photo_url || athlete.photo || null)
      setPhotoFile(null)
    }
  }, [open, athlete])

  function onPhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError(t('profileEdit.errSelectImage')); return }
    // No size cap: resize happens silently in-browser before upload.
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError('')
  }

  async function save(e) {
    e.preventDefault(); setError(''); setSuccess('')
    if (newPw && oldPw !== athlete.password) { setError(t('profileEdit.errCurrentPassword')); return }
    if (newPw && newPw.length < 4) { setError(t('profileEdit.errPasswordTooShort')); return }
    setSaving(true)

    const updates = { email, phone_number: phone }
    if (dob) updates.date_of_birth = dob
    if (newPw) updates.password = newPw

    // Upload new photo first — if Storage is down we fail before touching the row.
    // On success: write URL to photo_url and null the legacy photo column
    // (user explicitly chose to replace, so old data is safe to drop).
    if (photoFile) {
      setUploadingPhoto(true)
      try {
        const photoUrl = await uploadProfilePhoto(photoFile, { kind: 'students', id: athlete.id })
        updates.photo_url = photoUrl
        updates.photo = null
      } catch (uploadErr) {
        setError(t('profileEdit.errPhotoUpload') + uploadErr.message)
        setUploadingPhoto(false)
        setSaving(false)
        return
      }
      setUploadingPhoto(false)
    }

    const { error: err } = await supabase.from('students').update(updates).eq('id', athlete.id)
    if (err) { setError(t('profileEdit.saveError')); setSaving(false); return }
    setSuccess(t('profileEdit.successUpdated'))
    setSaving(false)
    setTimeout(() => { onSaved?.(); onClose() }, 800)
  }

  if (!open) return null

  const initials = getInitials(athlete?.name)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="modal-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="modal-title">{t('profileEdit.title')}</div>

        <form onSubmit={save}>
          {/* Photo Upload */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div
              className="photo-upload-wrapper"
              onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-block' }}
            >
              <div className="profile-avatar large" style={{ margin: '0 auto', cursor: 'pointer' }}>
                {photoPreview
                  ? <img src={photoPreview} alt="" />
                  : initials}
              </div>
              <div className="photo-upload-overlay">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPhotoSelect}
                style={{ display: 'none' }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--pf-text3)', marginTop: 6 }}>
              {t('profileEdit.tapToChangePhoto')}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('profileEdit.email')}</label>
            <input className="form-input" type="email" placeholder={t('profileEdit.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('profileEdit.phone')}</label>
            <input className="form-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('profileEdit.dob')}</label>
            <input className="form-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>

          {/* Password section */}
          <div style={{ borderTop: '1px solid var(--pf-border)', paddingTop: 14, marginTop: 6, marginBottom: 14 }}>
            <span className="form-label" style={{ marginBottom: 12, display: 'block' }}>{t('profileEdit.changePassword')}</span>
            <div className="form-group">
              <label className="form-label">{t('profileEdit.currentPassword')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showOld ? 'text' : 'password'}
                  placeholder={t('profileEdit.currentPassword')}
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                />
                <button type="button" onClick={() => setShowOld(!showOld)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pf-text3)' }}>
                  {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('profileEdit.newPassword')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showNew ? 'text' : 'password'}
                  placeholder={t('profileEdit.newPassword')}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <button type="button" onClick={() => setShowNew(!showNew)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pf-text3)' }}>
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}
          {success && <div className="alert-success">{success}</div>}

          <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
            <button type="button" className="btn-outline" onClick={onClose} style={{ flex: 1, width: 'auto' }}>{t('profileEdit.cancel')}</button>
            <button type="submit" className="btn-primary" disabled={saving || uploadingPhoto} style={{ flex: 1 }}>
              {saving || uploadingPhoto ? t('profileEdit.saving') : t('profileEdit.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
