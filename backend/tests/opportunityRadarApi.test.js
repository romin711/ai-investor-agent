const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const PORT = 3217;
const SERVER_START_TIMEOUT_MS = 12000;
const REQUEST_TIMEOUT_MS = 10000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: route,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error.message}\nRaw: ${raw}`));
            return;
          }

          resolve({
            statusCode: res.statusCode,
            body: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${route}`));
    });
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function requestRaw(method, route, rawBody, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = typeof rawBody === 'string' ? rawBody : '';
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path: route,
        method,
        headers: {
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error.message}\nRaw: ${raw}`));
            return;
          }

          resolve({
            statusCode: res.statusCode,
            body: parsed,
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${method} ${route}`));
    });
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function waitForServerReady() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    try {
      const health = await requestJson('GET', '/health');
      if (health.statusCode === 200 && health.body?.ok === true) {
        return;
      }
    } catch (_error) {
      // Keep polling until timeout.
    }

    await wait(250);
  }

  throw new Error('Server did not become ready before timeout.');
}

async function run() {
  const backendDir = path.join(__dirname, '..');
  const server = spawn('node', ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      HOST,
      PORT: String(PORT),
    },
    stdio: 'ignore',
  });

  try {
    await waitForServerReady();

    const radarPayload = {
      portfolio: [
        { symbol: 'TCS', weight: 40 },
        { symbol: 'RELIANCE', weight: 35 },
      ],
    };

    const radarResponse = await requestJson('POST', '/api/agent/opportunity-radar', radarPayload);
    assert.strictEqual(radarResponse.statusCode, 200, 'Radar endpoint should return HTTP 200');
    assert.strictEqual(Array.isArray(radarResponse.body?.alerts), true, 'Radar response should include alerts array');
    assert.strictEqual(typeof radarResponse.body?.portfolioInsight, 'string', 'Radar response should include portfolioInsight');
    assert.strictEqual(radarResponse.body?.workflow?.length, 3, 'Radar workflow should include 3 steps');

    if (radarResponse.body.alerts.length > 0) {
      const first = radarResponse.body.alerts[0];
      assert.strictEqual(Number.isFinite(Number(first.priorityScore)), true, 'Alert should include numeric priorityScore');
      assert.strictEqual(Array.isArray(first.contextSignals), true, 'Alert should include contextSignals array');

      if (first.contextSignals.length > 0) {
        const signal = first.contextSignals[0];
        assert.ok(signal.credibilityTier, 'Context signal should include credibilityTier');
        assert.strictEqual(Number.isFinite(Number(signal.recencyWeight)), true, 'Context signal should include recencyWeight');
      }
    }

    const historyResponse = await requestJson('GET', '/api/agent/opportunity-radar/history?limit=2');
    assert.strictEqual(historyResponse.statusCode, 200, 'History endpoint should return HTTP 200');
    assert.strictEqual(Array.isArray(historyResponse.body?.items), true, 'History response should include items array');
    assert.strictEqual(Number.isFinite(Number(historyResponse.body?.count)), true, 'History response should include count');
    assert.strictEqual(historyResponse.body.count <= 2, true, 'History endpoint should respect limit parameter');

    if (historyResponse.body.items.length > 0) {
      const runItem = historyResponse.body.items[0];
      assert.strictEqual(Array.isArray(runItem.alerts), true, 'History item should include alerts array');
      assert.strictEqual(typeof runItem.generatedAt, 'string', 'History item should include generatedAt');
      assert.strictEqual(typeof runItem.portfolioInsight, 'string', 'History item should include portfolioInsight');
    }

    const invalidJsonResponse = await requestRaw(
      'POST',
      '/api/agent/opportunity-radar',
      '{"portfolio": [}',
      { 'Content-Type': 'application/json' }
    );
    assert.strictEqual(invalidJsonResponse.statusCode, 400, 'Invalid JSON should return HTTP 400');
    assert.strictEqual(invalidJsonResponse.body?.error, 'Invalid JSON body.', 'Invalid JSON should return clear error');

    const emptyBodyResponse = await requestRaw(
      'POST',
      '/api/agent/opportunity-radar',
      '',
      { 'Content-Type': 'application/json' }
    );
    assert.strictEqual(emptyBodyResponse.statusCode, 400, 'Empty body should return HTTP 400');
    assert.strictEqual(
      emptyBodyResponse.body?.error,
      'Portfolio payload must be array rows or rawInput text.',
      'Empty body should return payload validation error'
    );

    const wrongPayloadResponse = await requestJson('POST', '/api/agent/opportunity-radar', { foo: 'bar' });
    assert.strictEqual(wrongPayloadResponse.statusCode, 400, 'Wrong payload type should return HTTP 400');
    assert.strictEqual(
      wrongPayloadResponse.body?.error,
      'Portfolio payload must be array rows or rawInput text.',
      'Wrong payload type should return payload validation error'
    );

    const unknownRouteResponse = await requestJson('GET', '/api/agent/opportunity-radar/nope');
    assert.strictEqual(unknownRouteResponse.statusCode, 404, 'Unknown route should return HTTP 404');
    assert.strictEqual(unknownRouteResponse.body?.error, 'Route not found.', 'Unknown route should return route error');

    console.log('All Opportunity Radar API tests passed (including negative cases).');
  } finally {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
    }

    await Promise.race([
      new Promise((resolve) => server.once('close', resolve)),
      wait(1000),
    ]);

    if (server.exitCode === null) {
      server.kill('SIGKILL');
      await Promise.race([
        new Promise((resolve) => server.once('close', resolve)),
        wait(1000),
      ]);
    }
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error.message || error);
    process.exit(1);
  });
