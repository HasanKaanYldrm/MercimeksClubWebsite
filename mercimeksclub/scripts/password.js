import { randomBytes, scryptSync } from 'node:crypto';

const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
console.log('Yönetici parolası (parola yöneticinize kaydedin):', password);
console.log('ADMIN_PASSWORD_HASH:', salt + ':' + hash.toString('hex'));
console.log('DEVICE_SECRET:', randomBytes(32).toString('hex'));
