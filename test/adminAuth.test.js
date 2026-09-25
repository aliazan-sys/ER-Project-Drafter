import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getAdminSession,
  requireAdmin,
  signInAdmin,
} from '../shared/adminAuth.js'

const originalFetch = globalThis.fetch
const originalUrl = process.env.SUPABASE_URL
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY

function response(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockResponse() {
  return {
    headers: new Map(),
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers.set(name, value) },
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
  }
}

function cookieHeader(res) {
  return res.headers.get('Set-Cookie').map((cookie) => cookie.split(';')[0]).join('; ')
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = originalUrl
  if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey
})

test('signs in an admin and stores Supabase tokens in HTTP-only cookies', async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /grant_type=password/)
    return response(200, {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      user: { id: 'admin-id', email: 'admin@example.com', app_metadata: { role: 'admin' } },
    })
  }

  const res = mockResponse()
  const result = await signInAdmin('admin@example.com', 'password', res)
  assert.equal(result.ok, true)
  assert.deepEqual(result.user, { id: 'admin-id', email: 'admin@example.com' })
  const cookies = res.headers.get('Set-Cookie')
  assert.equal(cookies.length, 2)
  assert.match(cookies[0], /HttpOnly; SameSite=Strict/)
  assert.match(cookies[1], /HttpOnly; SameSite=Strict/)
})

test('rejects an authenticated Supabase user without the admin app role', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) {
      return response(200, {
        access_token: 'member-token',
        refresh_token: 'member-refresh',
        user: { id: 'member-id', email: 'member@example.com', app_metadata: {} },
      })
    }
    return response(200, {})
  }

  const result = await signInAdmin('member@example.com', 'password', mockResponse())
  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(calls, 2)
})

test('recognizes a valid admin access token without exposing it to the client', async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/auth\/v1\/user$/)
    assert.equal(options.headers.Authorization, 'Bearer access-token')
    return response(200, {
      id: 'admin-id',
      email: 'admin@example.com',
      app_metadata: { roles: ['admin'] },
    })
  }

  const user = await getAdminSession(
    { headers: { cookie: 'er_supabase_access=access-token; er_supabase_refresh=refresh-token' } },
    mockResponse(),
  )
  assert.deepEqual(user, { id: 'admin-id', email: 'admin@example.com' })
})

test('refreshes an expired access session with the rotating refresh token', async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /grant_type=refresh_token/)
    return response(200, {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      user: { id: 'admin-id', email: 'admin@example.com', app_metadata: { role: 'admin' } },
    })
  }

  const res = mockResponse()
  const user = await getAdminSession(
    { headers: { cookie: 'er_supabase_refresh=old-refresh' } },
    res,
  )
  assert.equal(user.email, 'admin@example.com')
  assert.match(cookieHeader(res), /er_supabase_access=new-access/)
  assert.match(cookieHeader(res), /er_supabase_refresh=new-refresh/)
})

test('protected APIs return 401 when no Supabase session is present', async () => {
  globalThis.fetch = async () => { throw new Error('fetch should not be called') }
  const res = mockResponse()
  const user = await requireAdmin({ headers: {} }, res)
  assert.equal(user, null)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { error: 'Admin authentication required.' })
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store')
})
