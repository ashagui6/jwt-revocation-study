import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const ACCESS_TOKEN_WAIT_SECONDS = Number(__ENV.ACCESS_TOKEN_WAIT_SECONDS || 125);

function jsonHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return { headers };
}

function nowIso() {
  return new Date().toISOString();
}

function logResponse(label, res) {
  console.log(`${nowIso()} | ${label} | status=${res.status} | body=${res.body}`);
}

export default function () {
  console.log(`${nowIso()} | starting short-refresh expiry test`);

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: 'test1',
      password: 'testpass',
    }),
    jsonHeaders()
  );

  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
  });
  logResponse('login', loginRes);

  const accessToken = loginRes.json('accessToken');
  const refreshToken = loginRes.json('refreshToken');
  const jti = loginRes.json('jti');
  const expiresIn = loginRes.json('expiresIn');

  console.log(`${nowIso()} | issued jti=${jti}`);
  console.log(`${nowIso()} | access token ttl seconds=${expiresIn}`);
  console.log(`${nowIso()} | refresh token present=${refreshToken ? 'yes' : 'no'}`);

  const preA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(accessToken));
  const preB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(accessToken));

  check(preA, {
    'service-a pre-logout is 200': (r) => r.status === 200,
  });
  check(preB, {
    'service-b pre-logout is 200': (r) => r.status === 200,
  });

  logResponse('service-a pre-logout', preA);
  logResponse('service-b pre-logout', preB);

  const logoutRes = http.post(
    `${BASE_URL}/auth/logout`,
    JSON.stringify({
      token: accessToken,
      refreshToken: refreshToken,
      reason: 'short_refresh_expiry_test',
    }),
    jsonHeaders()
  );

  check(logoutRes, {
    'logout status is 200': (r) => r.status === 200,
  });
  logResponse('logout', logoutRes);

  const postLogoutA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(accessToken));
  const postLogoutB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(accessToken));

  check(postLogoutA, {
    'service-a immediate post-logout is still 200': (r) => r.status === 200,
  });
  check(postLogoutB, {
    'service-b immediate post-logout is still 200': (r) => r.status === 200,
  });

  logResponse('service-a immediate post-logout', postLogoutA);
  logResponse('service-b immediate post-logout', postLogoutB);

  const refreshAfterLogout = http.post(
    `${BASE_URL}/auth/refresh`,
    JSON.stringify({ refreshToken }),
    jsonHeaders()
  );

  check(refreshAfterLogout, {
    'refresh after logout is 401': (r) => r.status === 401,
  });
  logResponse('refresh after logout', refreshAfterLogout);

  console.log(
    `${nowIso()} | waiting ${ACCESS_TOKEN_WAIT_SECONDS} seconds for access token to expire`
  );
  sleep(ACCESS_TOKEN_WAIT_SECONDS);

  const expiredA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(accessToken));
  const expiredB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(accessToken));

  check(expiredA, {
    'service-a after expiry is 401': (r) => r.status === 401,
  });
  check(expiredB, {
    'service-b after expiry is 401': (r) => r.status === 401,
  });

  logResponse('service-a after expiry', expiredA);
  logResponse('service-b after expiry', expiredB);

  const refreshAfterExpiry = http.post(
    `${BASE_URL}/auth/refresh`,
    JSON.stringify({ refreshToken }),
    jsonHeaders()
  );

  check(refreshAfterExpiry, {
    'refresh after expiry remains 401': (r) => r.status === 401,
  });
  logResponse('refresh after expiry', refreshAfterExpiry);

  console.log(`${nowIso()} | final summary | jti=${jti}`);
}