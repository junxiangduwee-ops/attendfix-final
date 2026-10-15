/**
 * Sync Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates all data flow between HR system and AttendFix:
 *
 *   pullFromHR(date)      — fetch attendance from HR → store in local DB
 *   detectMissing()       — find gaps → notify employees + HODs
 *   pushCorrectionToHR()  — after HOD approves → write back to HR system
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db       = require('../db');
const adapter  = require('../integrations/hrAdapter');
const { notifyMissingRecord, notifyHODApproval, notifyDecision } = require('./email');

// ── Pull attendance from HR system for a given date ──────────────────────────
async function pullFromHR(date = todayStr(), dateTo = null) {
  // Build list of dates to pull — single date or range
  const dates = dateTo ? getDateRange(date, dateTo) : [date];
  const log = { direction: 'pull', status: 'ok', records_affected: 0, detail: dates.length > 1 ? `range=${date}→${dateTo}` : `date=${date}` };

  try {
    const employees = await db('users')
      .whereIn('role', ['EMPLOYEE', 'HOD'])
      .where({ is_active: true })
      .select('id', 'staff_id');

    const staffIds = employees.map(e => e.staff_id);
    const empMap   = Object.fromEntries(employees.map(e => [e.staff_id, e.id]));

    for (const d of dates) {
      const records = await adapter.fetchAttendance(d, staffIds);
      for (const r of records) {
        const userId = empMap[r.staffId];
        if (!userId) continue;
        await db('attendance')
          .insert({ user_id: userId, date: r.date, clock_in: r.clockIn || null, clock_out: r.clockOut || null, source: 'HR_SYSTEM', hr_record_id: r.hrRecordId || null, synced_at: new Date() })
          .onConflict(['user_id', 'date'])
          .merge({
            clock_in:     db.raw(`CASE WHEN attendance.source = 'CORRECTED' THEN attendance.clock_in ELSE EXCLUDED.clock_in END`),
            clock_out:    db.raw(`CASE WHEN attendance.source = 'CORRECTED' THEN attendance.clock_out ELSE EXCLUDED.clock_out END`),
            hr_record_id: r.hrRecordId || null,
            synced_at:    new Date(),
            updated_at:   new Date(),
          });
        log.records_affected++;
      }
    }
    console.log(`[SYNC] Pulled ${log.records_affected} records from HR (${dates.length} day${dates.length > 1 ? 's' : ''})`);
  } catch (e) {
    log.status = 'failed';
    log.error  = e.message;
    console.error('[SYNC] pullFromHR failed:', e.message);
  }

  await db('hr_sync_log').insert(log);
  return log;
}

// ── Detect missing records and notify ────────────────────────────────────────
async function detectMissing(date = todayStr(), dateTo = null) {
  const dates = dateTo ? getDateRange(date, dateTo) : [date];
  console.log(`[SYNC] Detecting missing records for ${dates.length} day${dates.length > 1 ? 's' : ''} (${date}${dateTo ? ' → ' + dateTo : ''})…`);
  let notified = 0;

  try {
    const employees = await db('users')
      .whereIn('role', ['EMPLOYEE', 'HOD'])
      .where({ is_active: true });

    for (const d of dates) {
    for (const emp of employees) {
      const att = await db('attendance')
        .where({ user_id: emp.id, date: d })
        .first();

      // Skip if fully complete
      if (att?.clock_in && att?.clock_out) continue;

      const missingField = att?.clock_in ? 'clock_out' : 'clock_in';

      // Skip if already notified for this record
      const alreadyNotified = await db('notifications')
        .where({ user_id: emp.id, type: 'missing_record', ref_id: att?.id || null })
        .where('created_at', '>=', d)
        .first();
      if (alreadyNotified) continue;

      // Create a placeholder attendance row if none exists
      let attRow = att;
      if (!attRow) {
        [attRow] = await db('attendance')
          .insert({ user_id: emp.id, date: d, source: 'HR_SYSTEM', synced_at: new Date() })
          .onConflict(['user_id', 'date']).ignore()
          .returning('*');
        if (!attRow) attRow = await db('attendance').where({ user_id: emp.id, date: d }).first();
      }

      // Notify employee
      await db('notifications').insert({
        user_id: emp.id,
        type:    'missing_record',
        title:   `Missing ${missingField.replace('_', '-')} — ${formatDate(d)}`,
        message: `Your ${missingField.replace('_', ' ')} was not recorded for ${formatDate(d)}. Please submit a correction request within 48 hours to avoid payroll impact.`,
        ref_id:  attRow?.id || null,
      });

      // Notify HOD
      const hod = emp.hod_id ? await db('users').where({ id: emp.hod_id }).first() : null;
      if (hod) {
        await db('notifications').insert({
          user_id: hod.id,
          type:    'team_missing_record',
          title:   `Missing record — ${emp.name}`,
          message: `${emp.name} (${emp.staff_id}) has a missing ${missingField.replace('_', ' ')} on ${formatDate(d)}. They have been notified to submit a correction.`,
          ref_id:  attRow?.id || null,
        });
      }

      try { await notifyMissingRecord(emp, d, hod); } catch (e) { console.error(`[SYNC] Email error:`, e.message); }
      notified++;
    }
    } // end date loop

    console.log(`[SYNC] Missing detection done — ${notified} notifications sent.`);
  } catch (e) {
    console.error('[SYNC] detectMissing error:', e.message);
  }

  return { notified, dates: dates.length };
}

// ── Push approved correction back to HR system ───────────────────────────────
async function pushCorrectionToHR(correctionId) {
  const cr = await db('correction_requests as cr')
    .join('users as u', 'u.id', 'cr.user_id')
    .join('attendance as a', 'a.id', 'cr.attendance_id')
    .select('cr.*', 'u.staff_id', 'u.name as employee_name', 'a.hr_record_id')
    .where('cr.id', correctionId)
    .first();

  if (!cr) throw new Error(`Correction request ${correctionId} not found`);

  const log = { direction: 'push', status: 'ok', records_affected: 0, detail: `cr:${correctionId}` };

  try {
    const result = await adapter.pushCorrection({
      correctionId:  cr.id,
      staffId:       cr.staff_id,
      date:          cr.date,
      fieldMissing:  cr.field_missing,
      proposedTime:  cr.proposed_time,
      justification: cr.justification,
      hrRecordId:    cr.hr_record_id,  // so HR can find the original record
    });

    if (result.ok) {
      await db('correction_requests').where({ id: correctionId }).update({
        hr_synced:    true,
        hr_sync_status: 'ok',
        hr_synced_at: new Date(),
        updated_at:   new Date(),
      });
      log.records_affected = 1;
      console.log(`[SYNC] Correction ${correctionId} pushed to HR successfully.`);
    } else {
      throw new Error(result.error || 'HR push failed');
    }
  } catch (e) {
    log.status    = 'failed';
    log.error     = e.message;
    await db('correction_requests').where({ id: correctionId }).update({
      hr_synced:      false,
      hr_sync_status: 'failed',
      hr_sync_error:  e.message,
      updated_at:     new Date(),
    });
    console.error(`[SYNC] pushCorrectionToHR failed for CR ${correctionId}:`, e.message);
  }

  await db('hr_sync_log').insert(log);
  return log;
}

// ── Sync employee roster from HR (when HR system is connected) ───────────────
async function syncEmployees() {
  const log = { direction: 'pull', status: 'ok', records_affected: 0, detail: 'employee roster sync' };
  try {
    const employees = await adapter.syncEmployees();
    if (!employees) { log.detail = 'no-op (mock mode)'; await db('hr_sync_log').insert(log); return log; }

    const bcrypt = require('bcryptjs');
    for (const e of employees) {
      const existing = await db('users').where({ staff_id: e.staffId }).first();
      let hodId = null;
      if (e.hodStaffId) {
        const hod = await db('users').where({ staff_id: e.hodStaffId }).first();
        if (hod) hodId = hod.id;
      }
      if (existing) {
        await db('users').where({ id: existing.id }).update({ name: e.name, email: e.email.toLowerCase(), department: e.department, hod_id: hodId, updated_at: new Date() });
      } else {
        await db('users').insert({ name: e.name, email: e.email.toLowerCase(), password: bcrypt.hashSync(e.staffId, 10), staff_id: e.staffId, department: e.department || 'General', role: 'EMPLOYEE', hod_id: hodId });
      }
      log.records_affected++;
    }
    console.log(`[SYNC] Employee roster synced — ${log.records_affected} records.`);
  } catch (e) {
    log.status = 'failed'; log.error = e.message;
    console.error('[SYNC] syncEmployees error:', e.message);
  }
  await db('hr_sync_log').insert(log);
  return log;
}

// ── Retry failed HR push-backs (runs on a schedule) ─────────────────────────
async function retryFailedPushes() {
  const failed = await db('correction_requests')
    .where({ status: 'APPROVED', hr_synced: false, hr_sync_status: 'failed' })
    .select('id');

  console.log(`[SYNC] Retrying ${failed.length} failed HR push(es)…`);
  for (const cr of failed) {
    await pushCorrectionToHR(cr.id);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function getDateRange(from, to) {
  const dates = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}
function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

module.exports = { pullFromHR, detectMissing, pushCorrectionToHR, syncEmployees, retryFailedPushes };
