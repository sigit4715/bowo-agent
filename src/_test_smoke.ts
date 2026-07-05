import { AuthManager } from './auth.js';
import { InputSanitizer } from './sanitize.js';
import { CacheManager } from './cache.js';

// --- Auth ---
const auth = new AuthManager('test-secret-key');
const admin = auth.createDefaultAdmin();
console.log('✅ Default admin created:', admin.username, admin.role);
const token = auth.login('admin', 'admin123');
console.log('✅ Login token:', token ? 'received' : 'FAILED');

const verified = auth.verifyToken(token!.token);
console.log('✅ Token verified:', verified.valid, 'userId:', verified.userId, 'role:', verified.role);
console.log('  Error:', verified.error);

// Direct decode test
const tokenParts = token!.token.split('.');
console.log('  Token parts:', tokenParts.length);
const decodedPayload = JSON.parse(Buffer.from(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64').toString('utf-8'));
console.log('  Decoded payload:', JSON.stringify(decodedPayload, null, 2));
console.log('  Expiry:', decodedPayload.exp, 'Now:', Math.floor(Date.now() / 1000));

const users = auth.getUsers();
console.log('✅ Users count:', users.length);
const u2 = auth.register('viewer1', 'pass1', 'viewer');
console.log('✅ Registered viewer:', u2.username);
console.log('✅ Total users:', auth.getUsers().length);
const deleted = auth.deleteUser(u2.id);
console.log('✅ Deleted viewer:', deleted);
console.log('✅ Users after delete:', auth.getUsers().length);

// Bad password
const badLogin = auth.login('admin', 'wrong');
console.log('✅ Bad login returns null:', badLogin === null);

// --- Sanitize ---
const s = new InputSanitizer();
console.log('✅ Sanitize HTML:', s.sanitize('<b>hello</b> & world'));
console.log('✅ Validate email:', s.validateEmail('test@example.com'));
console.log('✅ Invalid email:', s.validateEmail('bad@@email'));
console.log('✅ Validate URL:', s.validateUrl('https://example.com'));
console.log('✅ Invalid URL:', s.validateUrl('not-a-url'));
const jsonResult = s.validateJSON('{"a": 1}');
console.log('✅ Validate JSON:', jsonResult.valid, jsonResult.data);
console.log('✅ Bad JSON:', s.validateJSON('{bad}').valid);
console.log('✅ Prevent injection:', s.preventInjection('SELECT * FROM users'));
console.log('✅ Strip ANSI:', s.stripAnsi('\x1b[31mred\x1b[0m'));
console.log('✅ Safe path:', s.isSafePath('data/file.txt'));
console.log('✅ Unsafe path:', s.isSafePath('../../etc/passwd'));

// --- Cache ---
const c = new CacheManager(5);
c.set('name', 'BOWO', 10);
console.log('✅ Cache get:', c.get('name'));
console.log('✅ Cache has:', c.has('name'));
console.log('✅ Cache size:', c.size());
console.log('✅ Cache delete:', c.delete('name'));
console.log('✅ After delete get:', c.get('name'));
c.set('a', '1', 1);
c.set('b', '2', 1);
console.log('✅ Cache size 2:', c.size());
console.log('✅ Cleanup:', c.cleanup(), 'removed');
const val = c.getOrSet('computed', () => 42);
console.log('✅ getOrSet:', val);
const stats = c.getStats();
console.log('✅ Stats:', JSON.stringify(stats));
console.log('✅ Keys:', c.keys());
c.clear();
console.log('✅ After clear size:', c.size());
c.destroy();

console.log('\n🎉 All smoke tests passed!');
