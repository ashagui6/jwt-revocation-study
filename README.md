# JWT Revocation Study

This project evaluates the security and performance trade-offs of three JWT-based authentication designs in a distributed web architecture.

## Goal

Compare these three authentication modes:

- `stateless_long`
- `short_refresh`
- `blacklist`

The study focuses on four metrics:

- revocation latency
- logout correctness
- authentication overhead
- propagation consistency

## Architecture

This testbed includes:

- `gateway` on port `8080`
- `auth-service` on port `8081`
- `service-a` on port `8082`
- `service-b` on port `8083`
- `redis` on port `6379`

## Modes

### 1. `stateless_long`
Long-lived stateless JWTs.

Expected behavior:
- token works before logout
- token may still work after logout until it expires

### 2. `short_refresh`
Short-lived access tokens with refresh tokens.

Expected behavior:
- access token may continue working until expiry
- refresh token should stop working after logout

### 3. `blacklist`
JWTs with a stateful revocation store in Redis.

Expected behavior:
- token works before logout
- token should be rejected shortly after logout or revoke

## Requirements

- Docker
- Docker Compose
- Optional: k6 installed locally

## Project Structure

```text
jwt-revocation-study/
  compose.yaml
  .env
  README.md
  gateway/
  auth-service/
  service-a/
  service-b/
  k6/
  scripts/


Commands to build and run everything:

Build: 
docker compose ps
docker compose up --build -d

check health:
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8083/health

Manual API test commands...
login:
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"testpass"}'

Copy the accessToken from the response.

call protected endpoint:
curl http://localhost:8080/api/a/protected \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

logout:
curl -X POST http://localhost:8080/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_ACCESS_TOKEN","reason":"manual_test"}'

call protected again:
curl http://localhost:8080/api/a/protected \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

Expected behavior:

stateless_long: token still works until expiry
short_refresh: access token may still work until expiry, but refresh should fail after logout
blacklist: token should fail shortly after logout

Run the k6 test...

If you have k6 installed locally:
k6 run k6/smoke.js

Or with Docker:
docker run --rm -i --network host grafana/k6 run - < k6/smoke.js

For the second script:
docker run --rm -i --network host grafana/k6 run - < k6/revocation-latency.js


Switch between modes...
Edit .env and restart.

stateless baseline...
    MODE=stateless_long
    ACCESS_TOKEN_TTL_SECONDS=3600
    REFRESH_TOKEN_TTL_SECONDS=604800
short-lived with refresh...
    MODE=short_refresh
    ACCESS_TOKEN_TTL_SECONDS=120
    REFRESH_TOKEN_TTL_SECONDS=604800
blacklist revocation...
    MODE=blacklist
    ACCESS_TOKEN_TTL_SECONDS=3600
    REFRESH_TOKEN_TTL_SECONDS=604800

Then restart:

docker compose down
docker compose up --build -d

Run the same k6 smoke test again.




Repo Structure... 

jwt-revocation-study/
  README.md
  .env
  compose.yaml

  docs/
    test-plan.md
    metrics.md
    architecture-notes.md

  scripts/
    run-baseline.sh
    run-all-modes.sh
    collect-logs.sh

  gateway/
    Dockerfile
    package.json
    src/
      index.js
      config.js
      middleware/
        authForwarding.js

  auth-service/
    Dockerfile
    package.json
    src/
      index.js
      config.js
      routes/
        login.js
        refresh.js
        logout.js
        revoke.js
      services/
        tokenService.js
        revocationService.js

  service-a/
    Dockerfile
    package.json
    src/
      index.js
      middleware/
        verifyJwt.js
        checkRevocation.js
      routes/
        protected.js

  service-b/
    Dockerfile
    package.json
    src/
      index.js
      middleware/
        verifyJwt.js
        checkRevocation.js
      routes/
        protected.js

  shared/
    jwt/
      keys/
      claims.js
    logging/
      logger.js
    config/
      modes.js

  k6/
    smoke.js
    revocation-latency.js
    high-load.js
    lib/
      auth.js
      metrics.js

  data/
    raw/
    processed/
    exports/

  dashboards/
    grafana/
      dashboards.json