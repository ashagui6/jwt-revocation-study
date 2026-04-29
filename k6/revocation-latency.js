import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const PRE_LOGOUT_REQUESTS = Number(__ENV.PRE_LOGOUT_REQUESTS || 3);
const POST_LOGOUT_REQUESTS = Number(__ENV.POST_LOGOUT_REQUESTS || 10);
const POST_LOGOUT_INTERVAL_SECONDS = Number(__ENV.POST_LOGOUT_INTERVAL_SECONDS || 1);
const EXPECT_POST_LOGOUT_STATUS = __ENV.EXPECT_POST_LOGOUT_STATUS
  ? Number(__ENV.EXPECT_POST_LOGOUT_STATUS)
  : null;

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
  console.log(
    `${nowIso()} | ${label} | status=${res.status} | body=${res.body}`
  );
}

export default function () {
  console.log(`${nowIso()} | starting revocation latency test`);

  const loginPayload = JSON.stringify({
    username: 'test1',
    password: 'testpass',
  });

  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, jsonHeaders());
  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
  });
  logResponse('login', loginRes);

  const accessToken = loginRes.json('accessToken');
  const refreshToken = loginRes.json('refreshToken');
  const jti = loginRes.json('jti');

  console.log(`${nowIso()} | issued jti=${jti}`);
  console.log(`${nowIso()} | refresh token present=${refreshToken ? 'yes' : 'no'}`);

  for (let i = 0; i < PRE_LOGOUT_REQUESTS; i += 1) {
    const resA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(accessToken));
    const resB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(accessToken));

    check(resA, {
      [`service-a pre-logout request ${i + 1} is 200`]: (r) => r.status === 200,
    });
    check(resB, {
      [`service-b pre-logout request ${i + 1} is 200`]: (r) => r.status === 200,
    });

    logResponse(`service-a pre-logout ${i + 1}`, resA);
    logResponse(`service-b pre-logout ${i + 1}`, resB);
    sleep(1);
  }

  const logoutPayload = JSON.stringify({
    token: accessToken,
    refreshToken: refreshToken,
    reason: 'revocation_latency_test',
  });

  const logoutRes = http.post(`${BASE_URL}/auth/logout`, logoutPayload, jsonHeaders());
  check(logoutRes, {
    'logout status is 200': (r) => r.status === 200,
  });
  logResponse('logout', logoutRes);

  let firstRejectA = null;
  let firstRejectB = null;

  for (let i = 0; i < POST_LOGOUT_REQUESTS; i += 1) {
    const resA = http.get(`${BASE_URL}/api/a/protected`, jsonHeaders(accessToken));
    const resB = http.get(`${BASE_URL}/api/b/protected`, jsonHeaders(accessToken));

    logResponse(`service-a post-logout ${i + 1}`, resA);
    logResponse(`service-b post-logout ${i + 1}`, resB);

    if (EXPECT_POST_LOGOUT_STATUS !== null) {
      check(resA, {
        [`service-a post-logout request ${i + 1} matches expected status ${EXPECT_POST_LOGOUT_STATUS}`]:
          (r) => r.status === EXPECT_POST_LOGOUT_STATUS,
      });

      check(resB, {
        [`service-b post-logout request ${i + 1} matches expected status ${EXPECT_POST_LOGOUT_STATUS}`]:
          (r) => r.status === EXPECT_POST_LOGOUT_STATUS,
      });
    }

    if (!firstRejectA && resA.status >= 400) {
      firstRejectA = {
        requestNumber: i + 1,
        timestamp: nowIso(),
        status: resA.status,
      };
      console.log(
        `${nowIso()} | first rejection observed for service-a | request=${i + 1} | status=${resA.status}`
      );
    }

    if (!firstRejectB && resB.status >= 400) {
      firstRejectB = {
        requestNumber: i + 1,
        timestamp: nowIso(),
        status: resB.status,
      };
      console.log(
        `${nowIso()} | first rejection observed for service-b | request=${i + 1} | status=${resB.status}`
      );
    }

    sleep(POST_LOGOUT_INTERVAL_SECONDS);
  }

  if (refreshToken) {
    const refreshPayload = JSON.stringify({ refreshToken });
    const refreshRes = http.post(`${BASE_URL}/auth/refresh`, refreshPayload, jsonHeaders());
    logResponse('refresh after logout', refreshRes);
  }

  console.log(`${nowIso()} | final summary | jti=${jti}`);
  console.log(
    `${nowIso()} | service-a first reject=${firstRejectA ? JSON.stringify(firstRejectA) : 'none observed'}`
  );
  console.log(
    `${nowIso()} | service-b first reject=${firstRejectB ? JSON.stringify(firstRejectB) : 'none observed'}`
  );
}