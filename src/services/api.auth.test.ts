import test from 'node:test';
import assert from 'node:assert/strict';

// Set up minimal localStorage shim before importing api.ts
const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, val: string) => {
      memoryStorage.set(key, String(val));
    },
    removeItem: (key: string) => {
      memoryStorage.delete(key);
    },
    clear: () => {
      memoryStorage.clear();
    },
  },
  configurable: true,
});

import { api } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Silent JWT Refresh: login & changePassword persist refreshToken and logout clears both', async () => {
  memoryStorage.clear();
  api.saveServerConfig({ useMockApi: false, apiBaseUrl: 'https://yaldi.ddns.net/hr-api' });

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/login')) {
        assert.equal((init?.headers as Record<string, string>)['X-Client-Platform'], 'web-dashboard');
        return jsonResponse({
          token: 'jwt-1',
          refreshToken: 'ref-1',
          userId: 'u-1',
          role: 'employee',
          mustChangePassword: false,
        });
      }
      if (url.endsWith('/auth/change-password')) {
        assert.equal((init?.headers as Record<string, string>)['X-Client-Platform'], 'web-dashboard');
        return jsonResponse({
          token: 'jwt-2',
          refreshToken: 'ref-2',
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const session = await api.auth.login('user@yaldi.ae', 'Pass1234');
    assert.equal(session.token, 'jwt-1');
    assert.equal(session.refreshToken, 'ref-1');
    assert.equal(api.auth.getSession()?.refreshToken, 'ref-1');

    const updated = await api.auth.changePassword({
      userId: 'u-1',
      currentPassword: 'Pass1234',
      newPassword: 'NewPass1234',
    });
    assert.equal(updated?.token, 'jwt-2');
    assert.equal(updated?.refreshToken, 'ref-2');
    assert.equal(api.auth.getSession()?.token, 'jwt-2');
    assert.equal(api.auth.getSession()?.refreshToken, 'ref-2');

    await api.auth.logout();
    assert.equal(api.auth.getSession(), null);
    assert.equal(memoryStorage.get('yaldi_hr_session_v2'), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Silent JWT Refresh: deduplicates concurrent 401 refreshes and replays failed requests', async () => {
  memoryStorage.clear();
  api.saveServerConfig({ useMockApi: false, apiBaseUrl: 'https://yaldi.ddns.net/hr-api' });

  const originalFetch = globalThis.fetch;
  let refreshCalls = 0;
  let sessionUpdatedCount = 0;
  let unauthorizedCount = 0;
  const unsubSession = api.onSessionUpdated((s) => {
    sessionUpdatedCount += 1;
    assert.equal(s.token, 'fresh-jwt');
    assert.equal(s.refreshToken, 'fresh-ref');
  });
  const unsubUnauth = api.onUnauthorized(() => {
    unauthorizedCount += 1;
  });

  try {
    // Seed initial session with expired access token & valid refreshToken
    globalThis.localStorage.setItem(
      'yaldi_hr_session_v2',
      JSON.stringify({
        token: 'expired-jwt',
        refreshToken: 'valid-ref',
        userId: 'u-1',
        role: 'employee',
        mode: 'live',
      })
    );

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;

      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        assert.equal(headers['X-Client-Platform'], 'web-dashboard');
        assert.deepEqual(JSON.parse(String(init?.body)), { refreshToken: 'valid-ref' });
        await new Promise((r) => setTimeout(r, 15));
        return jsonResponse({ token: 'fresh-jwt', refreshToken: 'fresh-ref' }, 200);
      }

      if (url.endsWith('/rosters/today')) {
        if (headers.Authorization === 'Bearer expired-jwt') {
          return jsonResponse({ detail: 'Token expired' }, 401);
        }
        assert.equal(headers.Authorization, 'Bearer fresh-jwt');
        return jsonResponse({ date: '2026-11-25', status: 'work', canClockIn: true });
      }

      if (url.endsWith('/visibility-rules/me')) {
        if (headers.Authorization === 'Bearer expired-jwt') {
          return jsonResponse({ detail: 'Token expired' }, 401);
        }
        assert.equal(headers.Authorization, 'Bearer fresh-jwt');
        return jsonResponse([]);
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const [rosterRes, visRes] = await Promise.all([
      api.rosters.today(),
      api.visibilityRules.getMe(),
    ]);

    assert.equal(rosterRes.canClockIn, true);
    assert.deepEqual(visRes, []);
    assert.equal(refreshCalls, 1);
    assert.equal(sessionUpdatedCount, 1);
    assert.equal(unauthorizedCount, 0);
    assert.equal(api.auth.getSession()?.token, 'fresh-jwt');
    assert.equal(api.auth.getSession()?.refreshToken, 'fresh-ref');
  } finally {
    unsubSession();
    unsubUnauth();
    globalThis.fetch = originalFetch;
  }
});

test('Silent JWT Refresh: clears session and triggers unauthorized when refresh fails with 401/403/423 or missing refreshToken', async () => {
  memoryStorage.clear();
  api.saveServerConfig({ useMockApi: false, apiBaseUrl: 'https://yaldi.ddns.net/hr-api' });

  const originalFetch = globalThis.fetch;
  let unauthorizedMessages: string[] = [];
  const unsub = api.onUnauthorized((msg) => {
    unauthorizedMessages.push(msg);
  });

  try {
    // Case 1: /auth/refresh returns 401
    globalThis.localStorage.setItem(
      'yaldi_hr_session_v2',
      JSON.stringify({
        token: 'expired-jwt',
        refreshToken: 'revoked-ref',
        userId: 'u-1',
        role: 'employee',
        mode: 'live',
      })
    );

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse({ detail: 'Refresh token revoked' }, 403);
      }
      return jsonResponse({ detail: 'Unauthorized' }, 401);
    }) as typeof fetch;

    await assert.rejects(() => api.rosters.today());
    assert.equal(api.auth.getSession(), null);
    assert.equal(unauthorizedMessages.length, 1);

    // Case 2: No refreshToken stored -> clears session without calling /auth/refresh
    unauthorizedMessages = [];
    let refreshCalled = false;
    globalThis.localStorage.setItem(
      'yaldi_hr_session_v2',
      JSON.stringify({
        token: 'expired-jwt',
        userId: 'u-1',
        role: 'employee',
        mode: 'live',
      })
    );
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        refreshCalled = true;
      }
      return jsonResponse({ detail: 'Unauthorized' }, 401);
    }) as typeof fetch;

    await assert.rejects(() => api.rosters.today());
    assert.equal(refreshCalled, false);
    assert.equal(api.auth.getSession(), null);
    assert.equal(unauthorizedMessages.length, 1);

    // Case 3: /auth/login returning 401 does NOT trigger refresh or unauthorized redirect
    unauthorizedMessages = [];
    refreshCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        refreshCalled = true;
      }
      return jsonResponse({ detail: 'Invalid email or password' }, 401);
    }) as typeof fetch;

    await assert.rejects(() => api.auth.login('user@yaldi.ae', 'WrongPass1'), /Invalid email or password/);
    assert.equal(refreshCalled, false);
    assert.equal(unauthorizedMessages.length, 0);
  } finally {
    unsub();
    globalThis.fetch = originalFetch;
  }
});
