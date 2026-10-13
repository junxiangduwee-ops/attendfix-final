/**
 * HR Adapter — AttendFix Integration Layer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the ONLY file that talks to the HR system.
 * Everything else in AttendFix calls these functions and doesn't care
 * what HR system is behind them.
 *
 * HOW TO SWITCH FROM MOCK TO REAL:
 *   1. Set HR_ADAPTER=api in your .env
 *   2. Fill in HR_API_URL, HR_API_KEY, HR_API_COMPANY_CODE in .env
 *   3. Implement the three functions below under the 'api' adapter
 *      by mapping your HR system's response fields to our schema
 *
 * FUNCTIONS:
 *   fetchAttendance(date)      → pulls clock-in/out records for a given date
 *   pushCorrection(request)    → writes an approved correction back to HR
 *   syncEmployees()            → pulls employee roster from HR
 *
 * RETURN SHAPES (same regardless of adapter):
 *   fetchAttendance → [{ staffId, date, clockIn, clockOut, hrRecordId }]
 *   pushCorrection  → { ok: true } | { ok: false, error: string }
 *   syncEmployees   → [{ staffId, name, email, department, hodStaffId }]
 * ═══════════════════════════════════════════════════════════════════════════
 */

const adapterType = process.env.HR_ADAPTER || 'mock';

// ── MOCK ADAPTER (default) ────────────────────────────────────────────────────
// Generates realistic fake attendance data so you can demo + test end-to-end
// without a live HR system. Replace with the 'api' adapter when ready.

const mockAdapter = {
  /**
   * Returns simulated attendance records for the given date.
   * In mock mode, 1 in 6 employees randomly has a missing clock-out
   * so the correction workflow always has something to trigger.
   */
  async fetchAttendance(date, staffIds = []) {
    const records = [];
    for (const staffId of staffIds) {
      // Simulate occasional missing records
      const seed = staffId.charCodeAt(staffId.length - 1) + new Date(date).getDate();
      const missingClockOut = seed % 6 === 0;
      const absent          = seed % 15 === 0;

      if (absent) continue; // no record at all → detected as missing

      records.push({
        staffId,
        date,
        clockIn:    randomClockIn(),
        clockOut:   missingClockOut ? null : randomClockOut(),
        hrRecordId: `MOCK-${staffId}-${date}`,
      });
    }
    return records;
  },

  /**
   * Simulates writing the correction back to the HR system.
   * In mock mode always succeeds and logs to console.
   */
  async pushCorrection(request) {
    console.log(`[HR ADAPTER MOCK] pushCorrection →
      Staff:  ${request.staffId}
      Date:   ${request.date}
      Field:  ${request.fieldMissing}
      Time:   ${request.proposedTime}
      Ref:    CR-${request.correctionId}`);
    // Simulate occasional failure for realism (1 in 10)
    if (Math.random() < 0.1) return { ok: false, error: 'Mock: HR system timeout (simulated)' };
    return { ok: true };
  },

  /**
   * Returns a static list of employees (from local DB in mock mode —
   * in real mode this would come from the HR system's employee API).
   */
  async syncEmployees() {
    // In mock mode, the DB is the source of truth for employees
    return null; // null = no-op, keep existing users
  },
};

// ── API ADAPTER (fill in when HR system is confirmed) ─────────────────────────

const apiAdapter = {
  async fetchAttendance(date, staffIds = []) {
    // ── REPLACE THIS with your HR system's actual API call ──────────────────
    // Example for a REST-based system:
    //
    // const response = await fetch(
    //   `${process.env.HR_API_URL}/attendance?date=${date}&company=${process.env.HR_API_COMPANY_CODE}`,
    //   { headers: { 'Authorization': `Bearer ${process.env.HR_API_KEY}`, 'Content-Type': 'application/json' } }
    // );
    // if (!response.ok) throw new Error(`HR API error: ${response.status}`);
    // const data = await response.json();
    //
    // Map HR system fields to AttendFix schema:
    // return data.records.map(r => ({
    //   staffId:    r.employee_id,          // ← map from HR field name
    //   date:       r.attendance_date,       // ← YYYY-MM-DD
    //   clockIn:    r.time_in,               // ← HH:MM:SS or null
    //   clockOut:   r.time_out,              // ← HH:MM:SS or null
    //   hrRecordId: r.record_id,             // ← HR's own record ID (for write-back)
    // }));
    // ────────────────────────────────────────────────────────────────────────
    throw new Error('HR_ADAPTER=api but fetchAttendance() is not yet implemented. See src/integrations/hrAdapter.js.');
  },

  async pushCorrection(request) {
    // ── REPLACE THIS with your HR system's actual write-back call ───────────
    // Example:
    //
    // const field = request.fieldMissing === 'clock_in' ? 'time_in' : 'time_out';
    // const response = await fetch(
    //   `${process.env.HR_API_URL}/attendance/${request.hrRecordId}/correct`,
    //   {
    //     method: 'PATCH',
    //     headers: { 'Authorization': `Bearer ${process.env.HR_API_KEY}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ [field]: request.proposedTime, corrected_by: 'AttendFix', reason: request.justification }),
    //   }
    // );
    // if (!response.ok) return { ok: false, error: `HR API: ${response.status}` };
    // return { ok: true };
    // ────────────────────────────────────────────────────────────────────────
    throw new Error('HR_ADAPTER=api but pushCorrection() is not yet implemented. See src/integrations/hrAdapter.js.');
  },

  async syncEmployees() {
    // ── REPLACE THIS with your HR system's employee roster API ──────────────
    // Example:
    //
    // const response = await fetch(
    //   `${process.env.HR_API_URL}/employees?company=${process.env.HR_API_COMPANY_CODE}&active=true`,
    //   { headers: { 'Authorization': `Bearer ${process.env.HR_API_KEY}` } }
    // );
    // const data = await response.json();
    // return data.employees.map(e => ({
    //   staffId:    e.employee_id,
    //   name:       e.full_name,
    //   email:      e.email,
    //   department: e.department,
    //   hodStaffId: e.manager_id,
    // }));
    // ────────────────────────────────────────────────────────────────────────
    throw new Error('HR_ADAPTER=api but syncEmployees() is not yet implemented. See src/integrations/hrAdapter.js.');
  },
};

// ── Export the right adapter ──────────────────────────────────────────────────
const adapter = adapterType === 'api' ? apiAdapter : mockAdapter;

console.log(`[HR ADAPTER] Mode: ${adapterType.toUpperCase()}${adapterType === 'mock' ? ' (demo data)' : ''}`);

module.exports = adapter;

// ── Internal helpers for mock data ───────────────────────────────────────────
function randomClockIn() {
  const h = 8 + Math.floor(Math.random() * 2); // 08 or 09
  const m = Math.floor(Math.random() * 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}
function randomClockOut() {
  const h = 17 + Math.floor(Math.random() * 2); // 17 or 18
  const m = Math.floor(Math.random() * 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
}
