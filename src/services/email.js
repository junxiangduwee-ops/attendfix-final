const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function send({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`📧 [EMAIL] To: ${to} | ${subject}`);
    return;
  }
  await t.sendMail({ from: process.env.EMAIL_FROM || 'AttendFix <no-reply@mrdiy.com>', to, subject, html });
}

const wrap = (accent, title, body) => `
<div style="font-family:-apple-system,sans-serif;max-width:580px;margin:0 auto;border-radius:10px;overflow:hidden;border:1px solid #e4e7ec">
  <div style="background:${accent};padding:18px 24px"><h2 style="color:#fff;margin:0;font-size:16px">${title}</h2></div>
  <div style="padding:22px 24px;background:#fff">
    ${body}
    <p style="color:#98a2b3;font-size:11px;margin-top:24px;border-top:1px solid #f2f4f7;padding-top:12px">
      AttendFix · MR DIY Attendance Correction System · Automated message, do not reply.
    </p>
  </div>
</div>`;

const btn = (url, label, color = '#1570EF') =>
  `<a href="${url}" style="display:inline-block;background:${color};color:#fff;padding:10px 20px;border-radius:7px;text-decoration:none;font-weight:600;margin:14px 0;font-size:13px">${label}</a>`;

const row = (label, value) =>
  `<tr><td style="color:#667085;padding:5px 0;font-size:13px;width:140px">${label}</td><td style="font-size:13px;font-weight:600">${value}</td></tr>`;

async function notifyMissingRecord(employee, date, hod) {
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/my-attendance`;
  await send({
    to: employee.email,
    subject: `[AttendFix] Action needed — missing record on ${date}`,
    html: wrap('#DC6803', '⚠️ Missing attendance record detected', `
      <p style="font-size:14px">Dear <strong>${employee.name}</strong>,</p>
      <p style="font-size:13px;color:#475467">Your attendance for <strong>${date}</strong> is incomplete. This was detected during the nightly sync with the HR system.</p>
      <p style="font-size:13px;color:#475467">Please submit a correction request within <strong>48 hours</strong> to avoid payroll impact.</p>
      ${btn(url, 'Submit correction request →')}
    `),
  });
  if (hod) {
    await send({
      to: hod.email,
      subject: `[AttendFix] FYI — ${employee.name} has a missing record on ${date}`,
      html: wrap('#475467', `ℹ️ Missing record — ${employee.name}`, `
        <p style="font-size:13px">${employee.name} (${employee.staff_id}) has an incomplete attendance record for <strong>${date}</strong>. They have been notified automatically and asked to submit a correction.</p>
        <p style="font-size:13px;color:#475467">You will receive an approval request once they submit.</p>
      `),
    });
  }
}

async function notifyHODApproval(cr, hod) {
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/hod/approvals`;
  await send({
    to: hod.email,
    subject: `[AttendFix] Approval needed — ${cr.employee_name} · ${cr.date}`,
    html: wrap('#DC6803', '📋 Correction request awaiting your approval', `
      <p style="font-size:14px">Dear <strong>${hod.name}</strong>,</p>
      <p style="font-size:13px;color:#475467">A correction request requires your decision:</p>
      <table style="width:100%;margin:14px 0;border-collapse:collapse">
        ${row('Employee', cr.employee_name)}
        ${row('Date', cr.date)}
        ${row('Missing', cr.field_missing.replace('_', ' '))}
        ${row('Proposed time', `<span style="font-size:16px;color:#1570EF;font-family:monospace">${cr.proposed_time}</span>`)}
        ${cr.evidence ? row('Evidence', cr.evidence) : ''}
      </table>
      <div style="background:#fffaeb;border:1px solid #fec84b;border-radius:7px;padding:12px;margin:12px 0">
        <div style="font-size:11px;font-weight:700;color:#b54708;margin-bottom:4px">JUSTIFICATION</div>
        <div style="font-size:13px">${cr.justification}</div>
      </div>
      <p style="font-size:12px;color:#667085">If approved, the correction will be auto-filled locally and written back to the HR system.</p>
      ${btn(url, 'Review and decide →', '#DC6803')}
    `),
  });
}

async function notifyDecision(employee, cr, approved) {
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/my-requests`;
  const color = approved ? '#039855' : '#D92D20';
  await send({
    to: employee.email,
    subject: `[AttendFix] Your correction was ${approved ? 'approved' : 'rejected'} — ${cr.date}`,
    html: wrap(color,
      approved ? '✅ Correction approved' : '❌ Correction rejected',
      approved
        ? `<p style="font-size:14px">Dear <strong>${employee.name}</strong>,</p>
           <p style="font-size:13px;color:#475467">Your correction request for <strong>${cr.date}</strong> has been <strong style="color:#039855">approved</strong>.</p>
           <p style="font-size:13px;color:#475467">Your attendance record has been updated to <strong style="font-family:monospace;font-size:15px">${cr.proposed_time}</strong> and the correction has been submitted to the HR system.</p>
           ${btn(url, 'View my requests →', color)}`
        : `<p style="font-size:14px">Dear <strong>${employee.name}</strong>,</p>
           <p style="font-size:13px;color:#475467">Your correction request for <strong>${cr.date}</strong> has been <strong style="color:#D92D20">rejected</strong>.</p>
           <div style="background:#fef3f2;border:1px solid #fda29b;border-radius:7px;padding:12px;margin:12px 0">
             <div style="font-size:11px;font-weight:700;color:#b42318;margin-bottom:4px">HOD REMARKS</div>
             <div style="font-size:13px">${cr.hod_remarks || 'No remarks provided.'}</div>
           </div>
           <p style="font-size:13px;color:#475467">You may resubmit with additional evidence, or contact HR directly.</p>
           ${btn(url, 'Resubmit request →', color)}`
    ),
  });
}

// Confirm to employee that their submission was received
async function notifySubmissionConfirm(employee, cr, hod) {
  const url = `${process.env.APP_URL || 'http://localhost:3000'}/my-requests`;
  await send({
    to: employee.email,
    subject: `[AttendFix] Correction request received — ${cr.date}`,
    html: wrap('#1570EF', '📋 Correction request submitted', `
      <p style="font-size:14px">Dear <strong>${employee.name}</strong>,</p>
      <p style="font-size:13px;color:#475467">Your correction request has been received and sent to your HOD for approval.</p>
      <table style="width:100%;margin:14px 0;border-collapse:collapse">
        ${row('Date', cr.date)}
        ${row('Missing field', cr.field_missing.replace('_', ' '))}
        ${row('Proposed time', `<span style="font-family:monospace;font-size:15px;color:#1570EF">${cr.proposed_time}</span>`)}
        ${hod ? row('Sent to', hod.name) : ''}
      </table>
      <p style="font-size:13px;color:#475467">You will be notified once your HOD makes a decision.</p>
      ${btn(url, 'View my requests →')}
    `),
  });
}

module.exports = { notifyMissingRecord, notifyHODApproval, notifyDecision, notifySubmissionConfirm };
