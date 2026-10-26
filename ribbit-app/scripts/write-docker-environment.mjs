import { mkdirSync, writeFileSync } from 'node:fs';

function apiUrl(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required as a Docker build argument.`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must be an HTTP or HTTPS URL.`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials; frontend URLs are public.`);
  }
  return value.replace(/\/+$/, '');
}

const environment = {
  version: process.env.APP_VERSION?.trim() || '1.0',
  authUrl: apiUrl('AUTH_URL'),
  springUrl: apiUrl('SPRING_URL')
};

const directory = new URL('../src/app/environments/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(
  new URL('environment.ts', directory),
  `// Generated during the Docker build. API URLs are public browser configuration.\nexport const environment = ${JSON.stringify(environment, null, 2)};\n`
);