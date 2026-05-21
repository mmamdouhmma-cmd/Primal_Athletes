import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { downloadInvoicePDF, formatDate } from '../lib/helpers'
import { useLanguage } from '../context/LanguageContext'

/**
 * Build the invoice display object expected by `downloadInvoicePDF` from
 * the raw `invoices` row + its `invoice_payments` children. Mirrors the
 * shape the management webapp uses so the PDF layout is identical.
 */
function shapeInvoice(row, paymentRows, studentName, disciplineName) {
  const payments = (paymentRows || []).map((p) => ({
    method: prettyMethod(p.payment_method),
    type: p.payment_type || (p.notes || 'membership'),
    date: p.payment_date || p.created_at,
    amount: p.amount,
  }))
  const isPt = !!row.pt_sessions && row.pt_sessions > 0
  return {
    id: row.id,
    invoiceNum: row.invoice_number,
    date: row.created_at ? row.created_at.slice(0, 10) : null,
    name: studentName,
    discipline: isPt ? 'Personal Training' : (disciplineName || 'Membership'),
    startDate: row.membership_period_start || row.membership_start_date || null,
    endDate:   row.membership_period_end   || row.membership_end_date   || null,
    duration: row.duration_months
      ? `${row.duration_months} month${row.duration_months === 1 ? '' : 's'}`
      : '-',
    ptSessions: isPt ? row.pt_sessions : '-',
    ptCoachName: row.pt_coach_name || null,
    ptCoachNames: row.pt_coach_name ? [row.pt_coach_name] : [],
    amountPT: isPt ? row.total_amount : '-',
    total: row.total_amount,
    method: row.payment_method ? prettyMethod(row.payment_method) : '-',
    status: row.status || 'paid',
    amountPaid: row.amount_paid,
    remaining: row.remaining_amount,
    notes: row.notes,
    payments,
    isPtInvoice: isPt,
    _branch_id: row.branch_id,
  }
}

function prettyMethod(m) {
  if (!m) return 'Cash'
  if (m === 'split') return 'Split'
  return m
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function statusClass(status) {
  if (status === 'paid')      return 'badge-active'
  if (status === 'partial' || status === 'pending') return 'badge-expiring'
  if (status === 'cancelled' || status === 'refunded') return 'badge-expired'
  return 'badge-active'
}

function statusLabel(status, t) {
  if (status === 'paid')      return t('invoices.statusPaid') || 'Paid'
  if (status === 'partial')   return t('invoices.statusPartial') || 'Partial'
  if (status === 'pending')   return t('invoices.statusPending') || 'Pending'
  if (status === 'cancelled') return t('invoices.statusCancelled') || 'Cancelled'
  if (status === 'refunded')  return t('invoices.statusRefunded') || 'Refunded'
  return status
}

export default function InvoicesTab({ athlete, disciplines }) {
  const { t } = useLanguage()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)

  const studentName = athlete?.name || ''

  // Resolve discipline display name from cached disciplines list.
  const disciplineName = useCallback(
    (id) => {
      if (!id) return null
      const d = disciplines?.find((x) => x.id === id)
      return d?.name || null
    },
    [disciplines],
  )

  useEffect(() => {
    if (!athlete?.id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data: invRows, error: invErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('student_id', athlete.id)
        .order('created_at', { ascending: false })

      if (invErr) {
        if (!cancelled) {
          setError(invErr.message)
          setLoading(false)
        }
        return
      }
      const ids = (invRows || []).map((r) => r.id)
      let payRows = []
      if (ids.length > 0) {
        const { data: payments } = await supabase
          .from('invoice_payments')
          .select('invoice_id, payment_method, payment_type, amount, payment_date, notes, created_at')
          .in('invoice_id', ids)
          .order('payment_date', { ascending: true })
        payRows = payments || []
      }
      const byInv = {}
      for (const p of payRows) {
        ;(byInv[p.invoice_id] ||= []).push(p)
      }
      const shaped = (invRows || []).map((r) =>
        shapeInvoice(r, byInv[r.id] || [], studentName, disciplineName(r.discipline_id)),
      )
      if (!cancelled) {
        setInvoices(shaped)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [athlete?.id, studentName, disciplineName])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 0', color: 'var(--pf-text3)', fontSize: 13 }}>
        <div className="spinner" />
        {t('common.loading') || 'Loading…'}
      </div>
    )
  }

  if (error) {
    return <div className="alert-error">{error}</div>
  }

  if (invoices.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 14, color: 'var(--pf-text2)', fontWeight: 600, marginBottom: 4 }}>
          {t('invoices.empty') || 'No invoices yet'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--pf-text3)' }}>
          {t('invoices.emptyHint') || 'Once you sign up or renew, your invoices will appear here.'}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {invoices.map((inv) => (
          <button
            key={inv.id}
            className="card"
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              border: '1px solid var(--pf-border)',
              padding: 0,
              background: 'var(--pf-surface)',
              width: '100%',
            }}
            onClick={() => setViewing(inv)}
          >
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: 'var(--pf-text2)',
                    letterSpacing: '0.4px',
                  }}>{inv.invoiceNum}</span>
                  <span className={`badge ${statusClass(inv.status)}`}>{statusLabel(inv.status, t)}</span>
                  {inv.isPtInvoice && (
                    <span className="badge" style={{ background: 'var(--pf-blue-soft)', color: 'var(--pf-blue-light)' }}>
                      {t('invoices.pt') || 'PT'}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: 'var(--pf-text)', fontWeight: 500 }}>
                  {inv.discipline}
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--pf-text3)' }}>
                  {formatDate(inv.date)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--pf-text)' }}>
                  {fmtCurrency(inv.total)}
                </div>
                {inv.status === 'partial' && (
                  <div style={{ fontSize: 10, color: 'var(--pf-amber)', marginTop: 2 }}>
                    {fmtCurrency(inv.remaining)} {t('invoices.due') || 'due'}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {viewing && (
        <InvoiceDetailModal invoice={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  )
}

function fmtCurrency(n) {
  if (n == null || n === '-') return '-'
  return `AED ${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function InvoiceDetailModal({ invoice, onClose }) {
  const { t } = useLanguage()
  const isPart = invoice.status === 'partial'

  function handleDownload() {
    downloadInvoicePDF(invoice, '/primal-fitness-logo_transparent.png')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>
              {t('invoices.title') || 'Invoice'}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--pf-text2)' }}>
              {invoice.invoiceNum}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close" style={{ float: 'none' }}>×</button>
        </div>

        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <span className={`badge ${statusClass(invoice.status)}`} style={{ marginRight: 6 }}>
            {statusLabel(invoice.status, t)}
          </span>
          {invoice.isPtInvoice && (
            <span className="badge" style={{ background: 'var(--pf-blue-soft)', color: 'var(--pf-blue-light)' }}>
              {t('invoices.pt') || 'PT'}
            </span>
          )}
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ padding: 14 }}>
            <Row label={t('invoices.discipline') || 'Discipline'} value={invoice.discipline} />
            <Row label={t('invoices.date') || 'Date'} value={formatDate(invoice.date)} />
            {invoice.startDate && (
              <Row label={t('invoices.periodStart') || 'Period start'} value={formatDate(invoice.startDate)} />
            )}
            {invoice.endDate && (
              <Row label={t('invoices.periodEnd') || 'Period end'} value={formatDate(invoice.endDate)} />
            )}
            {invoice.isPtInvoice && (
              <>
                <Row label={t('invoices.ptSessions') || 'PT sessions'} value={invoice.ptSessions} />
                {invoice.ptCoachName && (
                  <Row label={t('invoices.ptCoach') || 'PT coach'} value={invoice.ptCoachName} />
                )}
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header">
            <span className="card-title">{t('invoices.payment') || 'Payment'}</span>
          </div>
          <div className="card-body" style={{ padding: 14 }}>
            <Row label={t('invoices.total') || 'Total'} value={fmtCurrency(invoice.total)} bold accent />
            <Row label={t('invoices.method') || 'Method'} value={invoice.method} />
            <Row label={t('invoices.paid') || 'Paid'} value={fmtCurrency(invoice.amountPaid)} positive />
            {isPart && (
              <Row label={t('invoices.remaining') || 'Remaining'} value={fmtCurrency(invoice.remaining)} warn />
            )}
            {invoice.payments && invoice.payments.length > 1 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--pf-border)' }}>
                <div style={{ fontSize: 10, color: 'var(--pf-text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  {t('invoices.breakdown') || 'Breakdown'}
                </div>
                {invoice.payments.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                    <span style={{ color: 'var(--pf-text2)' }}>
                      {p.method} · {formatDate(p.date)}
                    </span>
                    <span style={{ color: 'var(--pf-text)', fontWeight: 500 }}>{fmtCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleDownload}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 'var(--pf-radius-sm, 10px)',
            border: 'none',
            background: 'var(--pf-blue, #1B5EC5)',
            color: '#FFF',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.3px',
            cursor: 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif",
            textTransform: 'uppercase',
          }}
        >
          {t('invoices.download') || 'Download PDF'}
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, bold, accent, positive, warn }) {
  return (
    <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--pf-text2)' }}>{label}</span>
      <span style={{
        color: accent ? 'var(--pf-blue, #1B5EC5)' : positive ? 'var(--pf-green)' : warn ? 'var(--pf-amber)' : 'var(--pf-text)',
        fontWeight: bold ? 700 : 500,
      }}>
        {value}
      </span>
    </div>
  )
}
