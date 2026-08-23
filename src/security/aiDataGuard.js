/**
 * Blue AI Data Guard
 *
 * Hard boundary for data sent to external AI providers.
 * The AI layer must call sanitizeForAI() before making a provider request.
 *
 * This intentionally uses allow-listed fields and redacts common credentials.
 * It does NOT attempt to corrupt data: preventing sensitive data from leaving
 * the process is safer and more reliable than sending unusable/corrupted data.
 */

const MAX_INPUT_LENGTH = 4000;

const SECRET_PATTERNS = [
  /(?:sk|pk)-[A-Za-z0-9_-]{20,}/gi,
  /(?:api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*[^\s,;]+/gi,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /Bot\s+[A-Za-z0-9._~+/=-]{20,}/gi,
  /https?:\/\/[^\s:@]+:[^\s@]+@[^\s]+/gi,
];

const DISALLOWED_INPUT = [
  /process\.env/gi,
  /(?:^|\b)(?:\.env|credentials?|private[_ -]?key|client[_ -]?secret|database[_ -]?url)(?:\b|$)/gi,
];

function redactSecrets(value) {
  let output = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '[REDACTED]');
  }
  return output;
}

export function sanitizeForAI(input) {
  if (typeof input !== 'string') {
    throw new TypeError('AI input must be a string');
  }

  const trimmed = input.trim();
  if (!trimmed) return '';

  if (trimmed.length > MAX_INPUT_LENGTH) {
    throw new Error('AI input exceeds the safety limit');
  }

  if (DISALLOWED_INPUT.some((pattern) => pattern.test(trimmed))) {
    throw new Error('AI request contains blocked sensitive-data references');
  }

  return redactSecrets(trimmed).slice(0, MAX_INPUT_LENGTH);
}

/**
 * Construct the ONLY payload shape that the AI provider layer should receive.
 * No Discord interaction object, environment variables, database records,
 * filesystem paths, tokens, or credentials are accepted here.
 */
export function createSafeAIPayload(message) {
  const content = sanitizeForAI(message);

  return Object.freeze({
    content,
    dataPolicy: 'NO_SECRETS_NO_PRIVATE_DATA_NO_TOOLS',
  });
}

export const AI_DATA_POLICY = Object.freeze({
  allowFilesystem: false,
  allowDatabase: false,
  allowEnvironment: false,
  allowDiscordTokens: false,
  allowCredentials: false,
  allowExternalTools: false,
  storePrompts: false,
  storeResponses: false,
});
