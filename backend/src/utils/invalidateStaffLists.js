// Ye-Almaz — forget every cached list that is built from the staff accounts.
// Delivery Performance and Lab Performance are cached for 30 minutes and the HR list for a few minutes, and they list
// people straight from the users table. Without this, a driver added (or moved to another role) this minute stayed
// missing from — or kept appearing on — those dashboards until the cache expired.
const { invalidate } = require('../cache');

const invalidateStaffLists = () => invalidate(
  'dashboard:delivery-performance:*', 'dashboard:lab-performance:*', 'dashboard:summary',
  'employees:*', 'dispatch:*', 'delivery:*',
);

module.exports = { invalidateStaffLists };
