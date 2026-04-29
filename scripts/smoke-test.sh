#!/usr/bin/env bash

set -e

echo "Checking service health..."
for url in \
  http://localhost:8080/health \
  http://localhost:8081/health \
  http://localhost:8082/health \
  http://localhost:8083/health
do
  curl -s "$url"
  echo
done

echo
echo "Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"testpass"}')

echo "$LOGIN_RESPONSE"

ACCESS_TOKEN=$(printf '%s' "$LOGIN_RESPONSE" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
REFRESH_TOKEN=$(printf '%s' "$LOGIN_RESPONSE" | sed -n 's/.*"refreshToken":"\([^"]*\)".*/\1/p')

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Failed to extract access token"
  exit 1
fi

echo
echo "Calling service-a protected endpoint..."
curl -s http://localhost:8080/api/a/protected \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo

echo
echo "Calling service-b protected endpoint..."
curl -s http://localhost:8080/api/b/protected \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo

echo
echo "Logging out..."
if [ -n "$REFRESH_TOKEN" ]; then
  curl -s -X POST http://localhost:8080/auth/logout \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$ACCESS_TOKEN\",\"refreshToken\":\"$REFRESH_TOKEN\",\"reason\":\"smoke_test\"}"
else
  curl -s -X POST http://localhost:8080/auth/logout \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$ACCESS_TOKEN\",\"reason\":\"smoke_test\"}"
fi
echo

echo
echo "Calling service-a after logout..."
curl -s http://localhost:8080/api/a/protected \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo

echo
echo "Calling service-b after logout..."
curl -s http://localhost:8080/api/b/protected \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo

if [ -n "$REFRESH_TOKEN" ] && [ "$REFRESH_TOKEN" != "null" ]; then
  echo
  echo "Trying refresh after logout..."
  curl -s -X POST http://localhost:8080/auth/refresh \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
  echo
fi

echo
echo "Smoke test complete."