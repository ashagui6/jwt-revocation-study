const express = require('express');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8082;
const MODE = process.env.MODE || 'stateless_long';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SERVICE_NAME = process.env.SERVICE_NAME || 'service-a';

const redis = new Redis(REDIS_URL);

function nowIso() {
  return new Date().toISOString();
}

function logEvent(event) {
  console.log(JSON.stringify(event));
}

async function verifyAccess(req, res, next) {
  const startedAt = Date.now();
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing bearer token',
      service: SERVICE_NAME,
      timestamp: nowIso()
    });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (MODE === 'blacklist') {
      const isRevoked = await redis.get(`revoked:jti:${decoded.jti}`);
      if (isRevoked) {
        logEvent({
          timestamp: nowIso(),
          service: SERVICE_NAME,
          mode: MODE,
          event: 'protected_request',
          userId: decoded.sub,
          jti: decoded.jti,
          result: 'rejected',
          reason: 'revoked',
          latencyMs: Date.now() - startedAt
        });

        return res.status(401).json({
          error: 'Token revoked',
          service: SERVICE_NAME,
          userId: decoded.sub,
          jti: decoded.jti,
          timestamp: nowIso()
        });
      }
    }

    req.user = decoded;
    req.requestLatencyMs = Date.now() - startedAt;
    next();
  } catch (err) {
    logEvent({
      timestamp: nowIso(),
      service: SERVICE_NAME,
      mode: MODE,
      event: 'protected_request',
      userId: null,
      jti: null,
      result: 'rejected',
      reason: 'invalid_or_expired',
      latencyMs: Date.now() - startedAt
    });

    return res.status(401).json({
      error: 'Invalid or expired token',
      service: SERVICE_NAME,
      timestamp: nowIso()
    });
  }
}

app.get('/health', async (req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
    mode: MODE,
    timestamp: nowIso()
  });
});

app.get('/protected', verifyAccess, async (req, res) => {
  logEvent({
    timestamp: nowIso(),
    service: SERVICE_NAME,
    mode: MODE,
    event: 'protected_request',
    userId: req.user.sub,
    jti: req.user.jti,
    result: 'accepted',
    latencyMs: req.requestLatencyMs || 0
  });

  return res.json({
    ok: true,
    service: SERVICE_NAME,
    mode: MODE,
    userId: req.user.sub,
    username: req.user.username,
    role: req.user.role,
    jti: req.user.jti,
    timestamp: nowIso()
  });
});

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on port ${PORT}`);
});