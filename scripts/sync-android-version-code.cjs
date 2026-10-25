'use strict';

const fs = require('node:fs');
const path = require('node:path');

function syncVersionCodeInGradle(source, versionCode) {
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error('Invalid Android versionCode in app.json');
  }
  const pattern = /^([ \t]*versionCode[ \t]+)\d+([ \t]*)$/gm;
  if ([...source.matchAll(pattern)].length !== 1) {
    throw new Error('Expected exactly one Android versionCode in app/build.gradle');
  }
  return source.replace(pattern, (_, prefix, suffix) => `${prefix}${versionCode}${suffix}`);
}

if (require.main === module && process.env.EAS_BUILD_PLATFORM === 'android'
  && process.env.EAS_BUILD_PROFILE === 'production') {
  const root = path.join(__dirname, '..');
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
  const source = fs.readFileSync(gradlePath, 'utf8');
  const updated = syncVersionCodeInGradle(source, appConfig.expo?.android?.versionCode);
  if (updated !== source) fs.writeFileSync(gradlePath, updated);
}

module.exports = { syncVersionCodeInGradle };
