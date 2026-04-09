import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 1
};

function jsonHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return { headers };
}

export default function () {
  const baseUrl = 'http://localhost:8080';

  const loginRes = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ username: 'test1', password: 'testpass' }),
    jsonHeaders()
  );

  check(loginRes, {
    'login ok': (r) => r.status === 200
  });

  const accessToken = loginRes.json('accessToken');
  const refreshToken = loginRes.json('refreshToken');

  for (let i = 0; i < 3; i++) {
    const res = http.get(`${baseUrl}/api/a/protected`, jsonHeaders(accessToken));
    console.log(`Before logout request ${i + 1}: ${res.status}`);
    sleep(1);
  }

  const logoutRes = http.post(
    `${baseUrl}/auth/logout`,
    JSON.stringify({
      token: accessToken,
      refreshToken: refreshToken,
      reason: 'revocation_latency_test'
    }),
    jsonHeaders()
  );

  check(logoutRes, {
    'logout ok': (r) => r.status === 200
  });

  for (let i = 0; i < 8; i++) {
    const res = http.get(`${baseUrl}/api/a/protected`, jsonHeaders(accessToken));
    console.log(`After logout request ${i + 1}: ${res.status}`);
    sleep(1);
  }
}