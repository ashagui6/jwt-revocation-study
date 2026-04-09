const express = require('express');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8081;
const MODE = process.env.MODE || 'stateless_long';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 3600);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 604800);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL);

const users = [
  { id: 'user-1', username: 'test1', password: 'testpass', role: 'user' }
];

function nowIso() {
  return new Date().toISOString();
}

function logEvent(event) {
  console.log(JSON.stringify(event));
}

function signAccessToken(user) {
  const jti = uuidv4();
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    jti
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });

  return { token, jti };
}

function signRefreshToken(user) {
  const refreshId = uuidv4();
  const payload = {
    sub: user.id,
    type: 'refresh',
    rid: refreshId
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS
  });

  return { token, refreshId };
}

app.get('/health', async (req, res) => {
  res.json({
    ok: true,
    service: 'auth-service',
    mode: MODE,
    timestamp: nowIso()
  });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find((u) => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { token: accessToken, jti } = signAccessToken(user);

  let refreshToken = null;
  if (MODE === 'short_refresh') {
    const refresh = signRefreshToken(user);
    refreshToken = refresh.token;

    await redis.set(
      `refresh:${refresh.token}`,
      JSON.stringify({ userId: user.id, refreshId: refresh.refreshId }),
      'EX',
      REFRESH_TOKEN_TTL_SECONDS
    );
  }

  logEvent({
    timestamp: nowIso(),
    service: 'auth-service',
    mode: MODE,
    event: 'login_issued',
    userId: user.id,
    jti
  });

  return res.json({
    accessToken,
    refreshToken,
    jti,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    timestamp: nowIso()
  });
});

app.post('/refresh', async (req, res) => {
  if (MODE !== 'short_refresh') {
    return res.status(400).json({ error: 'Refresh is only enabled in short_refresh mode' });
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refreshToken' });
  }

  const stored = await redis.get(`refresh:${refreshToken}`);
  if (!stored) {
    return res.status(401).json({ error: 'Refresh token invalid or revoked' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = users.find((u) => u.id === decoded.sub);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { token: newAccessToken, jti } = signAccessToken(user);

    logEvent({
      timestamp: nowIso(),
      service: 'auth-service',
      mode: MODE,
      event: 'refresh_issued',
      userId: user.id,
      jti
    });

    return res.json({
      accessToken: newAccessToken,
      jti,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      timestamp: nowIso()
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.post('/logout', async (req, res) => {
  const { token, refreshToken, reason } = req.body || {};
  const revokeReason = reason || 'logout';

  if (!token && !refreshToken) {
    return res.status(400).json({ error: 'Provide token or refreshToken' });
  }

  let revokedJti = null;
  let userId = null;

  if (token) {
    try {
      const decoded = jwt.decode(token);
      revokedJti = decoded?.jti || null;
      userId = decoded?.sub || null;

      if (MODE === 'blacklist' && revokedJti) {
        const expSeconds = decoded?.exp || Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
        const ttl = Math.max(expSeconds - Math.floor(Date.now() / 1000), 1);
        await redis.set(`revoked:jti:${revokedJti}`, '1', 'EX', ttl);
      }
    } catch (err) {
      // ignore decode errors for logging path
    }
  }

  if (refreshToken) {
    await redis.del(`refresh:${refreshToken}`);
  }

  logEvent({
    timestamp: nowIso(),
    service: 'auth-service',
    mode: MODE,
    event: 'token_revoked',
    userId,
    jti: revokedJti,
    reason: revokeReason
  });

  return res.json({
    success: true,
    revoked: true,
    mode: MODE,
    userId,
    jti: revokedJti,
    timestamp: nowIso()
  });
});

app.post('/revoke', async (req, res) => {
  const { token, reason } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  try {
    const decoded = jwt.decode(token);
    const jti = decoded?.jti;
    const userId = decoded?.sub || null;

    if (!jti) {
      return res.status(400).json({ error: 'Token missing jti' });
    }

    if (MODE === 'blacklist') {
      const expSeconds = decoded?.exp || Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
      const ttl = Math.max(expSeconds - Math.floor(Date.now() / 1000), 1);
      await redis.set(`revoked:jti:${jti}`, '1', 'EX', ttl);
    }

    logEvent({
      timestamp: nowIso(),
      service: 'auth-service',
      mode: MODE,
      event: 'admin_revoke',
      userId,
      jti,
      reason: reason || 'admin_revoke'
    });

    return res.json({
      success: true,
      revoked: true,
      userId,
      jti,
      timestamp: nowIso()
    });
  } catch (err) {
    return res.status(400).json({ error: 'Unable to process token' });
  }
});

app.listen(PORT, () => {
  console.log(`auth-service listening on port ${PORT}`);
});