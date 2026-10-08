import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUserManagementError } from './userManagementErrors.js';

test('user management errors expose server details, field validation, or a useful fallback', () => {
  assert.equal(
    formatUserManagementError(
      { response: { data: { detail: 'The last active administrator account cannot be deactivated.' } } },
      'Failed to deactivate user.',
    ),
    'The last active administrator account cannot be deactivated.',
  );
  assert.equal(
    formatUserManagementError(
      { response: { data: { message: 'This email address is already in use.' } } },
      'Failed to create user account.',
    ),
    'This email address is already in use.',
  );
  assert.equal(
    formatUserManagementError(
      { response: { data: { email: ['This email conflicts with another account username.'], role: ['Select a valid choice.'] } } },
      'Failed to update user account.',
    ),
    'Email: This email conflicts with another account username. Role: Select a valid choice.',
  );
  assert.equal(
    formatUserManagementError({ response: { data: {} } }, 'Unable to reach the server. Try again.'),
    'Unable to reach the server. Try again.',
  );
});
