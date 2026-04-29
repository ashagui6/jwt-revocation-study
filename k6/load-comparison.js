import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

function jsonHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return { headers };
}

function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: 'test1',
      password: 'testpass',
    }),
    jsonHeaders()
  );

  check(res, {
    'login status is 200': (r) => r.status === 200,
  });

  return {
    accessToken: res.json('accessToken'),
    refreshToken: res.json('refreshToken'),
    jti: res.json('jti'),
  };
}

export default function () {
  const session = login();

  const resA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(session.accessToken));
  const resB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(session.accessToken));

  check(resA, {
    'service-a protected status is 200': (r) => r.status === 200,
  });

  check(resB, {
    'service-b protected status is 200': (r) => r.status === 200,
  });

  sleep(1);
}