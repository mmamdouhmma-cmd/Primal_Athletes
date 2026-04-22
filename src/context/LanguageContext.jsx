import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { translations, LANGUAGES } from '../i18n/translations'

const LangCtx = createContext(null)
const STORAGE_KEY = 'primal_athlete_lang'

function resolveKey(dict, path) {
  const parts = path.split('.')
  let node = dict
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[p]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(str, params) {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && translations[saved]) return saved
    return 'en'
  })

  const meta = useMemo(() => LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0], [lang])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.setAttribute('lang', lang)
    document.documentElement.setAttribute('dir', meta.dir)
  }, [lang, meta])

  const t = useCallback(
    (key, params) => {
      const primary = resolveKey(translations[lang], key)
      if (primary !== undefined) return interpolate(primary, params)
      const fallback = resolveKey(translations.en, key)
      if (fallback !== undefined) return interpolate(fallback, params)
      return key
    },
    [lang]
  )

  const value = useMemo(
    () => ({
      lang,
      setLang: (code) => { if (translations[code]) setLang(code) },
      t,
      dir: meta.dir,
      isRTL: meta.dir === 'rtl',
      languages: LANGUAGES,
    }),
    [lang, t, meta]
  )

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>
}

export function useLanguage() {
  const ctx = useContext(LangCtx)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
