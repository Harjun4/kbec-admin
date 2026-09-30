const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing session inactivity timeout & auto-logout logic...');

const routeGuardPath = path.join(__dirname, '../public/js/route-guard.js');
const loginHtmlPath = path.join(__dirname, '../public/login.html');

const routeGuardContent = fs.readFileSync(routeGuardPath, 'utf8');
const loginHtmlContent = fs.readFileSync(loginHtmlPath, 'utf8');

// 1. Ensure inactivity configuration exists
assert.ok(routeGuardContent.includes('INACTIVITY_LIMIT_MS') || routeGuardContent.includes('inactivity'), 'Inactivity timeout limit must be defined in route-guard.js');
assert.ok(routeGuardContent.includes('lastActivityTime'), 'lastActivityTime must be tracked in route-guard.js');

// 2. Ensure auto-logout function cleans up auth keys
assert.ok(routeGuardContent.includes('session_expired_reason'), 'session_expired_reason must be set on auto logout');
assert.ok(routeGuardContent.includes('login.html'), 'Auto logout must redirect to login.html');

// 3. Ensure login.html handles session expired feedback
assert.ok(loginHtmlContent.includes('session_expired_reason'), 'login.html must check session_expired_reason');
assert.ok(loginHtmlContent.includes('lastActivityTime'), 'login.html must initialize lastActivityTime upon successful login');

console.log('✅ Inactivity timeout configuration checks passed!');
