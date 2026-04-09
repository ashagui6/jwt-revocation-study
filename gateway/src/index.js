const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const MODE = process.env.MODE || 'stateless_long';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
const SERVICE_A_URL = process.env.SERVICE_A_URL || 'http://localhost:8082';
const SERVICE_B_URL = process.env.SERVICE_B_URL || 'http://localhost:8083';

function nowIso() {
  return new Date().toISOString();
}

function logEvent(event) {
  console.log(JSON.stringify(event));
}

async function proxyRequest(req, res, targetBaseUrl, targetPath) {
  const startedAt = Date.now();
  const url = `${targetBaseUrl}${targetPath}`;

  const headers = {
    'Content-Type': 'application/json'
  };

  if (req.headers.authorization) {
    headers.Authorization = req.headers.authorization;
  }

  try {
    const upstreamRes = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
    });

    const text = await upstreamRes.text();
    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      data = { raw: text };
    }

    logEvent({
      timestamp: nowIso(),
      service: 'gateway',
      mode: MODE,
      event: 'proxy_request',
      method: req.method,
      path: req.originalUrl,
      upstream: url,
      status: upstreamRes.status,
      latencyMs: Date.now() - startedAt
    });

    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    logEvent({
      timestamp: nowIso(),
      service: 'gateway',
      mode: MODE,
      event: 'proxy_error',
      method: req.method,
      path: req.originalUrl,
      upstream: url,
      error: err.message,
      latencyMs: Date.now() - startedAt
    });

    return res.status(502).json({
      error: 'Bad gateway',
      details: err.message,
      timestamp: nowIso()
    });
  }
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'gateway',
    mode: MODE,
    timestamp: nowIso()
  });
});

app.post('/auth/login', (req, res) => {
  return proxyRequest(req, res, AUTH_SERVICE_URL, '/login');
});

app.post('/auth/refresh', (req, res) => {
  return proxyRequest(req, res, AUTH_SERVICE_URL, '/refresh');
});

app.post('/auth/logout', (req, res) => {
  return proxyRequest(req, res, AUTH_SERVICE_URL, '/logout');
});

app.post('/auth/revoke', (req, res) => {
  return proxyRequest(req, res, AUTH_SERVICE_URL, '/revoke');
});

app.get('/api/a/protected', (req, res) => {
  return proxyRequest(req, res, SERVICE_A_URL, '/protected');
});

app.get('/api/b/protected', (req, res) => {
  return proxyRequest(req, res, SERVICE_B_URL, '/protected');
});

app.listen(PORT, () => {
  console.log(`gateway listening on port ${PORT}`);
});