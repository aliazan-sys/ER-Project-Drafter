const ACCESS_COOKIE = 'er_supabase_access'
const REFRESH_COOKIE = 'er_supabase_refresh'
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60

function config() {
  return {
    url: String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
    publishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim(),
  }
}

export function adminAuthConfigured() {
  const { url, publishableKey } = config()
  return Boolean(/^https:\/\/.+\.supabase\.co$/i.test(url) && publishableKey)
}

function cookieValue(req, name) {
  const header = String(req.headers?.cookie || '')
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim())
    }
  }
  return ''
}

function cookieSecurity() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : ''
}

function setCookies(res, cookies) {
  res.setHeader('Set-Cookie', cookies)
}

function setSessionCookies(res, session) {
  const secure = cookieSecurity()
  const accessMaxAge = Math.max(60, Number(session.expires_in || 3600))
  setCookies(res, [
    `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${accessMaxAge}${secure}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${REFRESH_TTL_SECONDS}${secure}`,
  ])
}

export function clearAdminSessionCookies(res) {
  const secure = cookieSecurity()
  setCookies(res, [
    `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
    `${REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  ])
}

async function supabaseRequest(path, options = {}) {
  if (!adminAuthConfigured()) {
    return { ok: false, status: 503, data: { error: 'Admin access is not configured.' } }
  }

  const { url, publishableKey } = config()
  try {
    const response = await fetch(`${url}/auth/v1${path}`, {
      ...options,
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    return {
      ok: response.ok,
      status: response.status,
      data: await response.json().catch(() => ({})),
    }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      data: { error: 'Authentication service unavailable.', detail: String(error) },
    }
  }
}

function isAdmin(user) {
  const metadata = user?.app_metadata || {}
  return metadata.role === 'admin' || (Array.isArray(metadata.roles) && metadata.roles.includes('admin'))
}

function publicUser(user) {
  return user ? { id: user.id, email: user.email || null } : null
}

export async function signInAdmin(email, password, res) {
  const result = await supabaseRequest('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }),
  })

  if (!result.ok) {
    const status = result.status === 400 ? 401 : result.status
    return {
      ok: false,
      status,
      error: status === 401 ? 'Invalid email or password.' : result.data.error,
    }
  }

  if (!isAdmin(result.data.user)) {
    await supabaseRequest('/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${result.data.access_token}` },
    })
    return { ok: false, status: 403, error: 'This account does not have admin access.' }
  }

  setSessionCookies(res, result.data)
  return { ok: true, user: publicUser(result.data.user) }
}

async function userFromAccessToken(accessToken) {
  if (!accessToken) return null
  const result = await supabaseRequest('/user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return result.ok && isAdmin(result.data) ? result.data : null
}

async function refreshSession(refreshToken, res) {
  if (!refreshToken) return null
  const result = await supabaseRequest('/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!result.ok || !isAdmin(result.data.user)) return null
  setSessionCookies(res, result.data)
  return result.data.user
}

export async function getAdminSession(req, res) {
  if (!adminAuthConfigured()) return null

  const accessToken = cookieValue(req, ACCESS_COOKIE)
  const refreshToken = cookieValue(req, REFRESH_COOKIE)
  const user = (await userFromAccessToken(accessToken)) || (await refreshSession(refreshToken, res))
  if (!user) {
    if (accessToken || refreshToken) clearAdminSessionCookies(res)
    return null
  }
  return publicUser(user)
}

export async function signOutAdmin(req, res) {
  const accessToken = cookieValue(req, ACCESS_COOKIE)
  if (accessToken && adminAuthConfigured()) {
    await supabaseRequest('/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }
  clearAdminSessionCookies(res)
}

export async function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  const user = await getAdminSession(req, res)
  if (user) return user
  res.status(401).json({ error: 'Admin authentication required.' })
  return null
}
