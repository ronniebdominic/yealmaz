const NodeCache = require('node-cache');

const appCache = new NodeCache({ stdTTL: 300, checkperiod: 120, useClones: false });

function invalidate(...patterns) {
  const allKeys = appCache.keys();
  for (const pattern of patterns) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      allKeys.filter(k => k.startsWith(prefix)).forEach(k => appCache.del(k));
    } else {
      appCache.del(pattern);
    }
  }
}

module.exports = { appCache, invalidate };
