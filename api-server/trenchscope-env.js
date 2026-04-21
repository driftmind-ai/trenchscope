const fs = require('fs');
const path = require('path');

function readEnvValueFromFile(filePath, key) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const lines = fileContents.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const currentKey = trimmedLine.slice(0, separatorIndex).trim();

    if (currentKey !== key) {
      continue;
    }

    let value = trimmedLine.slice(separatorIndex + 1);
    const inlineCommentIndex = value.indexOf('#');

    if (inlineCommentIndex !== -1) {
      value = value.slice(0, inlineCommentIndex);
    }

    value = value.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }

    return value;
  }

  return '';
}

function getBirdeyeApiKey({
  envPaths = [
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '.env'),
  ],
  processEnv = process.env,
} = {}) {
  for (const envPath of envPaths) {
    const fileValue = readEnvValueFromFile(envPath, 'BIRDEYE_API_KEY').trim();

    if (fileValue) {
      return fileValue;
    }
  }

  return (processEnv.BIRDEYE_API_KEY || '').trim();
}

function getBirdeyeBaseUrl({
  envPaths = [
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '.env'),
  ],
  processEnv = process.env,
} = {}) {
  for (const envPath of envPaths) {
    const fileValue = readEnvValueFromFile(envPath, 'BIRDEYE_BASE_URL').trim();

    if (fileValue) {
      return fileValue;
    }
  }

  return (processEnv.BIRDEYE_BASE_URL || 'https://public-api.birdeye.so').trim();
}

module.exports = {
  getBirdeyeApiKey,
  getBirdeyeBaseUrl,
  readEnvValueFromFile,
};
