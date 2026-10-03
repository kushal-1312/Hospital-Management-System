const PDFDocument = require('pdfkit');

/**
 * UPGRADE 3: PDF Invoice Generator
 *
 * Generates a professional A4 invoice PDF with:
 *   - Hospital letterhead
 *   - Patient and invoice details
 *   - Line items table with tax breakdown
 *   - Insurance deduction
 *   - Payment history
 *   - Amount due summary
 *   - Footer with terms
 */

const COLORS = {
  primary:   '#0a6e5e',
  dark:      '#0f2027',
  muted:     '#718096',
  border:    '#e2e8f0',
  light:     '#f7fafc',
  danger:    '#dc2626',
  success:   '#059669',
  white:     '#ffffff'
};

const formatCurrency = (amount) =>
  `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * Generate invoice PDF
 * @param {Object} invoice - populated Invoice document
 * @param {Object} res - Express response (streams directly)
 */
const generateInvoicePDF = (invoice, res) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // Stream directly to HTTP response
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
  doc.pipe(res);

  const pageWidth = doc.page.width - 100; // 50px margin each side
  const col = (pct) => 50 + pageWidth * pct;

  // ── HEADER ─────────────────────────────────────────────────
  // Green header bar
  doc.rect(0, 0, doc.page.width, 120).fill(COLORS.primary);

  // Hospital name
  doc.fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(24)
    .text('MedCare HMS', 50, 35);

  doc.font('Helvetica')
    .fontSize(10)
    .fillColor('rgba(255,255,255,0.8)')
    .text('Hospital Management System', 50, 65)
    .text('123 Health Street, Bengaluru, Karnataka 560001', 50, 80)
    .text('Phone: +91-80-1234-5678  |  Email: billing@medcare-hms.com', 50, 95);

  // INVOICE label on right
  doc.font('Helvetica-Bold')
    .fontSize(28)
    .fillColor(COLORS.white)
    .text('INVOICE', 350, 35, { align: 'right', width: 200 });

  doc.font('Helvetica')
    .fontSize(11)
    .fillColor('rgba(255,255,255,0.8)')
    .text(invoice.invoiceNumber, 350, 72, { align: 'right', width: 200 });

  // ── INVOICE META ───────────────────────────────────────────
  let y = 145;

  // Two columns: Patient info (left) | Invoice info (right)
  const metaLeft = [
    ['Bill To:', invoice.patientName],
    ['Patient ID:', invoice.patient?.patientId || invoice.patientId || '—'],
    ['Contact:', invoice.patient?.contact?.phone || '—'],
    ['Address:', invoice.patient?.address?.city
      ? `${invoice.patient.address.city}, ${invoice.patient.address.state}`
      : '—']
  ];

  const metaRight = [
    ['Issue Date:', formatDate(invoice.issueDate)],
    ['Due Date:', formatDate(invoice.dueDate)],
    ['Appointment:', invoice.appointment?.appointmentId || '—'],
    ['Status:', invoice.status?.replace('_', ' ').toUpperCase()]
  ];

  doc.fillColor(COLORS.dark);

  metaLeft.forEach(([label, value], i) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted)
      .text(label, 50, y + i * 18);
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.dark)
      .text(value || '—', 130, y + i * 18);
  });

  metaRight.forEach(([label, value], i) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted)
      .text(label, 350, y + i * 18);

    const isStatus = label === 'Status:';
    const statusColor = invoice.status === 'paid' ? COLORS.success
      : invoice.status === 'cancelled' ? COLORS.danger
      : COLORS.primary;

    doc.font(isStatus ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .fillColor(isStatus ? statusColor : COLORS.dark)
      .text(value || '—', 430, y + i * 18);
  });

  // ── DIVIDER ────────────────────────────────────────────────
  y += 90;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLORS.border).lineWidth(1).stroke();

  // ── LINE ITEMS TABLE ───────────────────────────────────────
  y += 16;

  // Table header
  doc.rect(50, y, pageWidth, 24).fill(COLORS.primary);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9);
  const headers = [
    ['Description',  50,  200],
    ['Category',     250, 80],
    ['Qty',          330, 30],
    ['Unit Price',   360, 80],
    ['Disc %',       440, 35],
    ['Total',        475, 70]
  ];
  headers.forEach(([text, x, w]) => {
    doc.text(text, x + 4, y + 7, { width: w, align: x === 475 ? 'right' : 'left' });
  });

  y += 24;

  // Table rows
  (invoice.lineItems || []).forEach((item, idx) => {
    const rowBg = idx % 2 === 0 ? COLORS.white : COLORS.light;
    doc.rect(50, y, pageWidth, 22).fill(rowBg);

    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(9);
    doc.text(item.description, 54, y + 6, { width: 196 });
    doc.text(item.category, 254, y + 6, { width: 76 });
    doc.text(String(item.quantity), 334, y + 6, { width: 26, align: 'center' });
    doc.text(formatCurrency(item.unitPrice), 364, y + 6, { width: 76 });
    doc.text(`${item.discount || 0}%`, 444, y + 6, { width: 31, align: 'center' });
    doc.font('Helvetica-Bold')
      .text(formatCurrency(item.lineTotal), 479, y + 6, { width: 66, align: 'right' });

    y += 22;
  });

  // Table bottom border
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();

  // ── TOTALS ─────────────────────────────────────────────────
  y += 16;
  const totalsX = 370;

  const totalRows = [
    ['Subtotal', formatCurrency(invoice.subtotal), false],
    ['Discount', `- ${formatCurrency(invoice.totalDiscount)}`, false],
    [`GST / Tax`, formatCurrency(invoice.totalTax), false],
  ];

  if (invoice.insuranceCovered > 0) {
    totalRows.push([
      `Insurance (${invoice.insurance?.provider || 'Covered'})`,
      `- ${formatCurrency(invoice.insuranceCovered)}`,
      false
    ]);
  }

  totalRows.forEach(([label, value, bold]) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10).fillColor(COLORS.muted)
      .text(label, totalsX, y, { width: 110 });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(COLORS.dark)
      .text(value, totalsX + 110, y, { width: 65, align: 'right' });
    y += 18;
  });

  // Grand total highlight box
  y += 4;
  doc.rect(totalsX - 6, y - 4, 181, 28).fill(COLORS.primary);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.white)
    .text('Grand Total', totalsX, y + 4, { width: 110 })
    .text(formatCurrency(invoice.grandTotal), totalsX + 110, y + 4, { width: 65, align: 'right' });

  // Amount due
  y += 36;
  const dueColor = invoice.amountDue <= 0 ? COLORS.success : COLORS.danger;
  doc.rect(totalsX - 6, y - 4, 181, 26).fill(dueColor);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.white)
    .text(invoice.amountDue <= 0 ? 'PAID IN FULL' : 'Amount Due',
          totalsX, y + 3, { width: 110 })
    .text(formatCurrency(invoice.amountDue), totalsX + 110, y + 3, { width: 65, align: 'right' });

  // ── PAYMENT HISTORY ────────────────────────────────────────
  if (invoice.payments?.length > 0) {
    y += 48;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.dark)
      .text('Payment History', 50, y);
    y += 16;

    doc.rect(50, y, pageWidth, 20).fill(COLORS.light);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted)
      .text('Date', 54, y + 5)
      .text('Method', 150, y + 5)
      .text('Reference', 250, y + 5)
      .text('Amount', 480, y + 5, { width: 65, align: 'right' });
    y += 20;

    invoice.payments.forEach(pmt => {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.dark)
        .text(formatDate(pmt.paidAt), 54, y + 3)
        .text(pmt.method?.replace('_', ' '), 150, y + 3)
        .text(pmt.reference || '—', 250, y + 3)
        .font('Helvetica-Bold')
        .text(formatCurrency(pmt.amount), 480, y + 3, { width: 65, align: 'right' });
      doc.moveTo(50, y + 18).lineTo(545, y + 18).strokeColor(COLORS.border).lineWidth(0.3).stroke();
      y += 20;
    });
  }

  // ── INSURANCE DETAILS ──────────────────────────────────────
  if (invoice.insurance?.provider) {
    y += 16;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.dark).text('Insurance Details', 50, y);
    y += 14;
    const ins = invoice.insurance;
    [
      ['Provider', ins.provider],
      ['Policy No.', ins.policyNumber],
      ['Claim No.', ins.claimNumber],
      ['Status', ins.status?.replace('_', ' ')],
      ['Coverage', formatCurrency(ins.coverageAmount)]
    ].forEach(([label, val]) => {
      if (!val || val === 'undefined') return;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(label + ':', 50, y);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.dark).text(val, 140, y);
      y += 14;
    });
  }

  // ── NOTES ─────────────────────────────────────────────────
  if (invoice.notes) {
    y += 12;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.dark).text('Notes', 50, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text(invoice.notes, 50, y, { width: pageWidth });
  }

  // ── FOOTER ─────────────────────────────────────────────────
  const footerY = doc.page.height - 70;
  doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text(
      'Thank you for choosing MedCare HMS. Payment is due within 30 days of invoice date. ' +
      'For billing inquiries, contact billing@medcare-hms.com or call +91-80-1234-5678.',
      50, footerY + 8, { width: pageWidth, align: 'center' }
    );
  doc.text(
    `Generated on ${formatDate(new Date())} · ${invoice.invoiceNumber}`,
    50, footerY + 28, { width: pageWidth, align: 'center' }
  );

  doc.end();
};

module.exports = { generateInvoicePDF };
