const cron  = require('node-cron');
const { pullFromHR, detectMissing, retryFailedPushes, syncEmployees } = require('../services/sync');

const TZ = 'Asia/Kuala_Lumpur';

function startCronJobs() {
  // 1. Pull attendance from HR system daily (default 01:00 Mon–Sat)
  const hrSyncSchedule = process.env.HR_SYNC_SCHEDULE || '0 1 * * 1-6';
  cron.schedule(hrSyncSchedule, async () => {
    console.log('[CRON] HR sync triggered');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await pullFromHR(yesterday.toISOString().slice(0, 10));
  }, { timezone: TZ });

  // 2. Detect missing records and notify (default 23:45 Mon–Sat)
  const detectSchedule = process.env.MISSING_DETECT_SCHEDULE || '45 23 * * 1-6';
  cron.schedule(detectSchedule, async () => {
    console.log('[CRON] Missing-record detection triggered');
    await detectMissing();
  }, { timezone: TZ });

  // 3. Retry failed HR push-backs every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    await retryFailedPushes();
  }, { timezone: TZ });

  // 4. Sync employee roster weekly (Sunday 02:00)
  cron.schedule('0 2 * * 0', async () => {
    console.log('[CRON] Employee roster sync triggered');
    await syncEmployees();
  }, { timezone: TZ });

  console.log('⏰  Cron jobs started (KL timezone):');
  console.log(`    HR pull:          ${hrSyncSchedule}`);
  console.log(`    Missing detect:   ${detectSchedule}`);
  console.log(`    Retry HR push:    every 2 hours`);
  console.log(`    Employee sync:    Sundays 02:00`);
}

module.exports = { startCronJobs };
