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

  const loginPayload = JSON.stringify({
    username: 'test1',
    password: 'testpass'
  });

  const loginRes = http.post(`${baseUrl}/auth/login`, loginPayload, jsonHeaders());
  check(loginRes, {
    'login status is 200': (r) => r.status === 200
  });

  const accessToken = loginRes.json('accessToken');
  const refreshToken = loginRes.json('refreshToken');

  const beforeA = http.get(`${baseUrl}/api/a/protected`, jsonHeaders(accessToken));
  check(beforeA, {
    'service-a accepts token before logout': (r) => r.status === 200
  });

  const beforeB = http.get(`${baseUrl}/api/b/protected`, jsonHeaders(accessToken));
  check(beforeB, {
    'service-b accepts token before logout': (r) => r.status === 200
  });

  sleep(1);

  const logoutPayload = JSON.stringify({
    token: accessToken,
    refreshToken: refreshToken,
    reason: 'logout_test'
  });

  const logoutRes = http.post(`${baseUrl}/auth/logout`, logoutPayload, jsonHeaders());
  check(logoutRes, {
    'logout status is 200': (r) => r.status === 200
  });

  sleep(1);

  const afterA = http.get(`${baseUrl}/api/a/protected`, jsonHeaders(accessToken));
  const afterB = http.get(`${baseUrl}/api/b/protected`, jsonHeaders(accessToken));

  console.log(`After logout service-a status: ${afterA.status}`);
  console.log(`After logout service-b status: ${afterB.status}`);

  if (refreshToken) {
    const refreshPayload = JSON.stringify({ refreshToken });
    const refreshRes = http.post(`${baseUrl}/auth/refresh`, refreshPayload, jsonHeaders());
    console.log(`Refresh attempt after logout status: ${refreshRes.status}`);
  }
}