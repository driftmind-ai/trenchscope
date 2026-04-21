const test = require('node:test');
const assert = require('node:assert/strict');

const packageJson = require('./package.json');

test('dev script ignores runtime usage data files', () => {
  assert.match(
    packageJson.scripts.dev,
    /--ignore\s+data(?:[\\/]\*\*)?/,
    'nodemon dev script must ignore api-server/data so usage writes do not restart the API',
  );
});
