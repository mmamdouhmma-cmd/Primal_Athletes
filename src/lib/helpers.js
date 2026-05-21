export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function daysUntil(dateStr) {
  if (!dateStr) return 0
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

// Print-to-PDF for a single invoice. Mirrors the management webapp's helper
// (primal-fitness/src/utils/helpers.js). Opens a styled HTML doc in a new
// window; the browser's <title> drives the suggested filename and the print
// dialog provides Save-as-PDF. No external libs.
//
// `invoice` shape (built by the caller in this app):
//   { invoiceNum, date, name, discipline, startDate, endDate, duration,
//     ptSessions, ptCoachNames, amountPT, total, method, status,
//     amountPaid, remaining, payments: [{ method, type, date, amount }], notes }
export function downloadInvoicePDF(invoice, logoUrl) {
  const fullLogoUrl = logoUrl ? new URL(logoUrl, window.location.origin).href : null
  const esc = (v) => String(v ?? '-').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const cur = (n) => (n === '-' || n == null) ? '-' : `AED ${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDate = (d) => (!d || d === '-') ? '-' : new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const isPart = invoice.status === 'partial'
  const isSplit = invoice.method === 'Split' || (invoice.payments && invoice.payments.length > 1)

  let paymentsHTML = ''
  if (invoice.payments && invoice.payments.length > 0) {
    paymentsHTML = `<table style="width:100%;border-collapse:collapse;margin-top:8px">
      <tr style="background:#F8FAFC"><th style="text-align:left;padding:6px 10px;font-size:11px;color:#64748B">Method</th><th style="text-align:left;padding:6px 10px;font-size:11px;color:#64748B">Type</th><th style="text-align:left;padding:6px 10px;font-size:11px;color:#64748B">Date</th><th style="text-align:right;padding:6px 10px;font-size:11px;color:#64748B">Amount</th></tr>
      ${invoice.payments.map((p) => `<tr><td style="padding:6px 10px;font-size:12px">${esc(p.method)}</td><td style="padding:6px 10px;font-size:12px;text-transform:capitalize">${esc(p.type)}</td><td style="padding:6px 10px;font-size:12px">${fmtDate(p.date)}</td><td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:600">${cur(p.amount)}</td></tr>`).join('')}
    </table>`
  }

  // <title> drives the default filename when the user picks Save-as-PDF.
  const safeName = String(invoice.name ?? '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Member'
  const fileTitle = `${safeName}-${invoice.invoiceNum || 'Invoice'}-${invoice.date || ''}`.replace(/-+$/, '')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(fileTitle)}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:32px;color:#1E293B;font-size:13px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #2563EB}
  .logo img{height:40px;object-fit:contain}
  .logo-sub{font-size:11px;color:#64748B;margin-top:2px}
  .inv-num{font-size:18px;font-weight:700;text-align:right}
  .inv-date{font-size:12px;color:#64748B;text-align:right;margin-top:2px}
  .section{margin-bottom:20px}
  .section-title{font-size:13px;font-weight:700;color:#0F172A;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #E2E8F0}
  .row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
  .row .label{color:#64748B}
  .row .value{font-weight:500}
  .total-box{margin-top:16px;padding:12px 16px;border-radius:8px;font-size:14px;font-weight:700;text-align:center}
  .paid{background:#F0FDF4;color:#16A34A;border:1px solid #DCFCE7}
  .partial{background:#FFFBEB;color:#D97706;border:1px solid #FEF3C7}
  .footer{margin-top:32px;text-align:center;font-size:11px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:16px}
  @media print{body{padding:20px}}
</style></head><body>
<div class="header">
  <div><div class="logo">${fullLogoUrl ? `<img src="${fullLogoUrl}" alt="Primal Fitness">` : 'PRIMAL FITNESS'}</div><div class="logo-sub">Abu Dhabi, UAE</div></div>
  <div><div class="inv-num">${esc(invoice.invoiceNum)}</div><div class="inv-date">${fmtDate(invoice.date)}</div></div>
</div>
<div class="section">
  <div class="section-title">Athlete Information</div>
  <div class="row"><span class="label">Name</span><span class="value">${esc(invoice.name)}</span></div>
  <div class="row"><span class="label">Discipline</span><span class="value">${esc(invoice.discipline)}</span></div>
</div>
<div class="section">
  <div class="section-title">Membership Period</div>
  <div class="row"><span class="label">Start Date</span><span class="value">${fmtDate(invoice.startDate)}</span></div>
  <div class="row"><span class="label">End Date</span><span class="value">${fmtDate(invoice.endDate)}</span></div>
  <div class="row"><span class="label">Duration</span><span class="value">${esc(invoice.duration)}</span></div>
</div>
${invoice.ptSessions && invoice.ptSessions !== '-' ? `<div class="section"><div class="section-title">Personal Training</div><div class="row"><span class="label">${invoice.ptCoachNames?.length > 1 ? 'PT Coaches' : 'PT Coach'}</span><span class="value">${esc(invoice.ptCoachNames?.length > 0 ? invoice.ptCoachNames.join(', ') : (invoice.ptCoachName || '—'))}</span></div><div class="row"><span class="label">PT Sessions</span><span class="value">${esc(invoice.ptSessions)}</span></div><div class="row"><span class="label">PT Amount</span><span class="value">${cur(invoice.amountPT)}</span></div></div>` : ''}
<div class="section">
  <div class="section-title">Payment ${isSplit ? '(Split)' : ''}</div>
  <div class="row"><span class="label">Total Amount</span><span class="value" style="font-size:16px;font-weight:700;color:#2563EB">${cur(invoice.total)}</span></div>
  <div class="row"><span class="label">Payment Method</span><span class="value">${isSplit ? 'Split Payment' : esc(invoice.method)}</span></div>
  ${paymentsHTML}
  <div class="row" style="margin-top:8px"><span class="label">Amount Paid</span><span class="value" style="color:#16A34A">${cur(invoice.amountPaid)}</span></div>
  ${isPart ? `<div class="row"><span class="label">Remaining</span><span class="value" style="color:#D97706">${cur(invoice.remaining)}</span></div>` : ''}
</div>
<div class="total-box ${isPart ? 'partial' : 'paid'}">${isPart ? `Partial — ${cur(invoice.remaining)} remaining` : '✓ Fully Paid'}</div>
${invoice.notes ? `<div class="section" style="margin-top:16px"><div class="section-title">Notes</div><div style="font-size:12px;color:#475569">${esc(invoice.notes)}</div></div>` : ''}
<div class="footer">Primal Fitness — Abu Dhabi, UAE • This invoice was generated electronically</div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return // popup blocked
  win.document.write(html)
  win.document.close()
  setTimeout(() => { win.print() }, 400)
}
