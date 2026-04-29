import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const POST_REVOKE_REQUESTS = Number(__ENV.POST_REVOKE_REQUESTS || 10);
const POST_REVOKE_INTERVAL_SECONDS = Number(__ENV.POST_REVOKE_INTERVAL_SECONDS || 1);
const EXPECT_POST_REVOKE_STATUS = __ENV.EXPECT_POST_REVOKE_STATUS
  ? Number(__ENV.EXPECT_POST_REVOKE_STATUS)
  : null;

function jsonHeaders(token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers };
}

function nowIso() {
  return new Date().toISOString();
}

function logResponse(label, res) {
  console.log(`${nowIso()} | ${label} | status=${res.status} | body=${res.body}`);
}

export default function () {
  console.log(`${nowIso()} | starting admin revoke test`);

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username: 'test1', password: 'testpass' }),
    jsonHeaders()
  );

  check(loginRes, { 'login status is 200': (r) => r.status === 200 });
  logResponse('login', loginRes);

  const accessToken = loginRes.json('accessToken');
  const jti = loginRes.json('jti');

  console.log(`${nowIso()} | issued jti=${jti}`);

  const preA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(accessToken));
  const preB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(accessToken));

  check(preA, { 'service-a pre-revoke is 200': (r) => r.status === 200 });
  check(preB, { 'service-b pre-revoke is 200': (r) => r.status === 200 });

  logResponse('service-a pre-revoke', preA);
  logResponse('service-b pre-revoke', preB);

  const revokeRes = http.post(
    `${BASE_URL}/auth/revoke`,
    JSON.stringify({
      token: accessToken,
      reason: 'admin_revoke_k6_test',
    }),
    jsonHeaders()
  );

  check(revokeRes, { 'admin revoke status is 200': (r) => r.status === 200 });
  logResponse('admin revoke', revokeRes);

  let firstRejectA = null;
  let firstRejectB = null;

  for (let i = 0; i < POST_REVOKE_REQUESTS; i += 1) {
    const resA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(accessToken));
    const resB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(accessToken));

    logResponse(`service-a post-revoke ${i + 1}`, resA);
    logResponse(`service-b post-revoke ${i + 1}`, resB);

    if (EXPECT_POST_REVOKE_STATUS !== null) {
      check(resA, {
        [`service-a post-revoke ${i + 1} matches ${EXPECT_POST_REVOKE_STATUS}`]:
          (r) => r.status === EXPECT_POST_REVOKE_STATUS,
      });
      check(resB, {
        [`service-b post-revoke ${i + 1} matches ${EXPECT_POST_REVOKE_STATUS}`]:
          (r) => r.status === EXPECT_POST_REVOKE_STATUS,
      });
    }

    if (!firstRejectA && resA.status >= 400) {
      firstRejectA = { requestNumber: i + 1, timestamp: nowIso(), status: resA.status };
      console.log(`${nowIso()} | first rejection observed for service-a | request=${i + 1} | status=${resA.status}`);
    }

    if (!firstRejectB && resB.status >= 400) {
      firstRejectB = { requestNumber: i + 1, timestamp: nowIso(), status: resB.status };
      console.log(`${nowIso()} | first rejection observed for service-b | request=${i + 1} | status=${resB.status}`);
    }

    sleep(POST_REVOKE_INTERVAL_SECONDS);
  }

  console.log(`${nowIso()} | final summary | jti=${jti}`);
  console.log(`${nowIso()} | service-a first reject=${firstRejectA ? JSON.stringify(firstRejectA) : 'none observed'}`);
  console.log(`${nowIso()} | service-b first reject=${firstRejectB ? JSON.stringify(firstRejectB) : 'none observed'}`);
}