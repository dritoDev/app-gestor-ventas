import assert from 'node:assert/strict';
import { test } from 'node:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import { openApiDocument } from './openapi';
import { createRestToken } from './mcp-auth';

test('la especificación OpenAPI tiene referencias y operaciones válidas', async () => {
  await SwaggerParser.validate(openApiDocument);
  assert.deepEqual(openApiDocument.security, [{ sessionCookie: [] }]);
  assert.deepEqual(openApiDocument.paths['/auth/login']?.post?.security, []);
});

test('Swagger UI y el JSON se sirven públicamente; la API permanece protegida', async () => {
  process.env.JWT_SECRET ||= 'test-api-secret-with-at-least-32-characters';
  const { app } = await import('./app');
  const { pool } = await import('@gestor/db');
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const [json, ui, privateRoute] = await Promise.all([
      fetch(`${base}/openapi.json`), fetch(`${base}/api-docs/`), fetch(`${base}/products`),
    ]);
    assert.equal(json.status, 200);
    assert.equal((await json.json()).openapi, '3.0.3');
    assert.equal(ui.status, 200);
    assert.match(await ui.text(), /swagger-ui/);
    assert.equal(privateRoute.status, 401);

    const allowed = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Origin: base } });
    assert.equal(allowed.status, 200);
    const denied = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Origin: 'https://otro-dominio.example' } });
    assert.equal(denied.status, 403);

    const bridgeToken = await createRestToken({
      token: 'external-token-not-forwarded', clientId: 'test', scopes: ['mcp:read'],
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      extra: { userId: '3a34f819-1937-4ef0-a4cb-0ed8dd922203' },
    }, process.env.JWT_SECRET);
    const forbiddenWrite = await fetch(`${base}/products`, { method: 'POST', headers: { Authorization: `Bearer ${bridgeToken}` } });
    assert.equal(forbiddenWrite.status, 403);
    const invalidCookie = await fetch(`${base}/products`, { headers: { Cookie: `gestor_session=${bridgeToken}` } });
    assert.equal(invalidCookie.status, 401);
    const invalidBearer = await fetch(`${base}/products`, { headers: { Authorization: 'Bearer invalid' } });
    assert.equal(invalidBearer.status, 401);
  } finally {
    server.close();
    await pool.end();
  }
});
