import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { request, type Server } from 'node:http';
import express from 'express';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpRouter } from './mcp';
import { createMcpVerifier, createRestToken, readMcpConfig, verifyRestToken, type McpConfig } from './mcp-auth';

const secret = 'test-secret-for-mcp-at-least-32-characters';
const userId = '3a34f819-1937-4ef0-a4cb-0ed8dd922203';
const secondUserId = '0d472cbe-65be-4295-a1e0-0451815f4f47';

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await closed;
}

test('OAuth valida firma, emisor, audiencia, caducidad e identidad; el token REST está aislado', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const config: McpConfig = {
    resource: new URL('https://api.example.com/mcp'), issuer: 'https://auth.example.com',
    jwksUrl: new URL('https://auth.example.com/jwks'), userIdClaim: 'user_id',
    restUrl: new URL('http://127.0.0.1:4000'), allowedOrigins: [],
  };
  const verifier = createMcpVerifier(config, createLocalJWKSet({ keys: [jwk] }));
  const claims = { sub: 'provider-subject', user_id: userId, iss: config.issuer, aud: config.resource.href, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, scope: 'mcp:read' };
  const sign = (overrides: Record<string, unknown> = {}) => new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: 'ES256' }).sign(privateKey);
  const external = await sign();
  const auth = await verifier.verifyAccessToken(external);
  assert.equal(auth.extra?.userId, userId);
  for (const overrides of [
    { iss: 'https://attacker.example.com' }, { aud: 'https://other.example.com/mcp' },
    { exp: 1 }, { exp: undefined }, { iat: undefined }, { sub: undefined }, { user_id: 'not-a-uuid' },
    { nbf: Math.floor(Date.now() / 1000) + 3600 },
  ]) {
    await assert.rejects(verifier.verifyAccessToken(await sign(overrides)), /Token OAuth inválido/);
  }
  const attacker = await generateKeyPair('ES256');
  await assert.rejects(verifier.verifyAccessToken(await new SignJWT(claims).setProtectedHeader({ alg: 'ES256' }).sign(attacker.privateKey)));
  const internal = await createRestToken(auth, secret);
  assert.notEqual(internal, external);
  assert.deepEqual(await verifyRestToken(internal, secret), { userId, scopes: ['mcp:read'] });
  await assert.rejects(verifyRestToken(external, secret));
  await assert.rejects(verifier.verifyAccessToken(internal));
  await assert.rejects(jwtVerify(internal, new TextEncoder().encode(secret)));
  const session = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(new TextEncoder().encode(secret));
  await assert.rejects(verifyRestToken(session, secret));
  await assert.rejects(createRestToken({ ...auth, expiresAt: 1 }, secret));
});

test('Streamable HTTP: discovery, autenticación, herramientas REST, scopes y aislamiento entre usuarios', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key' };
  const app = express();
  app.use(express.json());
  app.get('/jwks', (_req, res) => res.json({ keys: [jwk] }));
  const { server, url } = await listen(app);
  const config: McpConfig = {
    resource: new URL(`${url}/mcp`), issuer: url, jwksUrl: new URL(`${url}/jwks`),
    userIdClaim: 'sub', restUrl: new URL(url), allowedOrigins: [url, 'https://client.example.com'],
  };
  app.use(createMcpRouter(config, secret));
  const calls: { method: string; path: string; body: unknown; userId: string; token: string }[] = [];
  let restStatus = 200;
  app.all(['/products', '/sales', '/inventory', '/dashboard', '/products/:id/stock', '/products/:id', '/sales/:id/cancel'], (req, res, next) => {
    const token = req.get('authorization')?.slice(7) || '';
    void verifyRestToken(token, secret).then(identity => {
      calls.push({ method: req.method, path: req.path, body: req.body, userId: identity.userId, token });
      if (restStatus === 302) { res.redirect('/redirect-target'); return; }
      res.status(restStatus).json(restStatus === 200 ? { products: [{ name: 'Producto de prueba' }], userId: identity.userId } : { error: 'Solo administradores' });
    }).catch(next);
  });
  const clients: Client[] = [];
  const sign = (scopes: string, subject = userId) => new SignJWT({ scope: scopes })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' }).setSubject(subject).setIssuer(url)
    .setAudience(config.resource.href).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  async function connect(token: string) {
    const client = new Client({ name: 'integration-test', version: '1.0.0' });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(config.resource, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
  }
  try {
    const discovery = await fetch(`${url}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(discovery.status, 200);
    assert.deepEqual((await discovery.json()).authorization_servers, [url]);
    const missing = await fetch(config.resource, { method: 'POST' });
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate')!, /resource_metadata=.*oauth-protected-resource\/mcp/);
    const invalid = await fetch(config.resource, { method: 'POST', headers: { Authorization: 'Bearer invalid' } });
    assert.equal(invalid.status, 401);
    const insufficient = await fetch(config.resource, { method: 'POST', headers: { Authorization: `Bearer ${await sign('mcp:write')}` } });
    assert.equal(insufficient.status, 403);
    for (const method of ['POST', 'GET', 'DELETE', 'OPTIONS']) {
      const denied = await fetch(config.resource, { method, headers: { Origin: 'https://evil.example.com' } });
      assert.equal(denied.status, 403);
    }
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(config.resource, { headers: { Host: 'evil.example.com' } }, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(badHostStatus, 403);
    const preflight = await fetch(config.resource, { method: 'OPTIONS', headers: { Origin: 'https://client.example.com' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://client.example.com');

    const readToken = await sign('mcp:read');
    for (const method of ['GET', 'DELETE']) {
      const unsupported = await fetch(config.resource, { method, headers: { Authorization: `Bearer ${readToken}` } });
      assert.equal(unsupported.status, 405);
    }
    const reader = await connect(readToken);
    assert.equal((await reader.listTools()).tools.length, 9);
    const result = await reader.callTool({ name: 'list_products', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(calls[0]?.path, '/products');
    assert.equal(calls[0]?.userId, userId);
    assert.notEqual(calls[0]?.token, readToken);
    const sale = { customerName: 'Cliente prueba', items: [{ productId: userId, quantity: 2 }] };
    const deniedWrite = await reader.callTool({ name: 'create_sale', arguments: sale });
    assert.equal(deniedWrite.isError, true);
    assert.equal(calls.length, 1);

    const writer = await connect(await sign('mcp:read mcp:write', secondUserId));
    await writer.callTool({ name: 'create_sale', arguments: sale });
    assert.equal(calls[1]?.method, 'POST');
    assert.equal(calls[1]?.path, '/sales');
    assert.deepEqual(calls[1]?.body, { ...sale, customerEmail: '' });
    const count = calls.length;
    const invalidInput = await writer.callTool({ name: 'adjust_stock', arguments: { id: '../auth/login', delta: 0, note: 'test' } });
    assert.equal(invalidInput.isError, true);
    assert.equal(calls.length, count);
    await Promise.all([reader.callTool({ name: 'get_dashboard' }), writer.callTool({ name: 'list_inventory' })]);
    assert.equal(calls.find(call => call.path === '/dashboard')?.userId, userId);
    assert.equal(calls.find(call => call.path === '/inventory')?.userId, secondUserId);
    restStatus = 403;
    const forbidden = await writer.callTool({ name: 'adjust_stock', arguments: { id: userId, delta: 1, note: 'Ajuste prueba' } });
    assert.equal(forbidden.isError, true);
    assert.match(JSON.stringify(forbidden.content), /403/);
    restStatus = 302;
    assert.equal((await reader.callTool({ name: 'list_products' })).isError, true);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await close(server);
  }
});

test('configuración OAuth incompleta falla y solo se permite HTTP local', () => {
  assert.equal(readMcpConfig({}), undefined);
  assert.throws(() => readMcpConfig({ MCP_PUBLIC_URL: 'http://localhost:4000/mcp' }), /Configura/);
  const env = { MCP_PUBLIC_URL: 'http://localhost:4000/mcp', MCP_OAUTH_ISSUER: 'https://auth.example.com', MCP_OAUTH_JWKS_URL: 'https://auth.example.com/jwks', JWT_SECRET: secret };
  assert.equal(readMcpConfig(env)?.resource.pathname, '/mcp');
  assert.throws(() => readMcpConfig({ ...env, MCP_PUBLIC_URL: 'http://public.example.com/mcp' }), /HTTPS/);
  assert.throws(() => readMcpConfig({ ...env, MCP_PUBLIC_URL: 'https://public.example.com/other' }), /terminar en \/mcp/);
});
