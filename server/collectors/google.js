import { JWT } from 'google-auth-library';
import { config } from '../config.js';

// Una sola service account para Search Console y la facturación; cada API pide su propio scope.
const clients = new Map();
export function googleClient(scope) {
  if (!clients.has(scope)) {
    // Acepta el JSON de la service account tal cual o en base64.
    const raw = config.google.credentials.trim();
    const creds = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    clients.set(scope, new JWT({ email: creds.client_email, key: creds.private_key, scopes: [scope] }));
  }
  return clients.get(scope);
}
