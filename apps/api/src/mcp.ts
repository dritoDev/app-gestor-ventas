import { Router } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { inventoryInput, productInput, productUpdate, saleInput } from '@gestor/shared';
import { createMcpVerifier, createRestToken, mcpScopes, readMcpConfig, type McpConfig } from './mcp-auth';

function createServer(config: McpConfig, auth: AuthInfo, secret: string) {
  const server = new McpServer({ name: 'mercato', version: '1.0.0' });
  async function rest(path: string, method = 'GET', body?: unknown): Promise<CallToolResult> {
    const requiredScope = method === 'GET' ? 'mcp:read' : 'mcp:write';
    if (!auth.scopes.includes(requiredScope)) {
      return { isError: true, content: [{ type: 'text', text: `Se requiere el scope ${requiredScope}` }] };
    }
    try {
      const token = await createRestToken(auth, secret);
      const response = await fetch(new URL(path, config.restUrl), {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      const data: unknown = await response.json();
      return {
        ...(response.ok ? {} : { isError: true }),
        content: [{ type: 'text', text: JSON.stringify(response.ok ? data : { status: response.status, error: data }) }],
      };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'No se pudo completar la petición a la API REST' }] };
    }
  }
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const writeAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
  for (const [name, path, description] of [
    ['list_products', '/products', 'Lista el catálogo (hasta 500 productos). Precios en céntimos de euro.'],
    ['list_sales', '/sales', 'Consulta las últimas 200 ventas y sus líneas.'],
    ['list_inventory', '/inventory', 'Consulta los últimos 200 movimientos de inventario.'],
    ['get_dashboard', '/dashboard', 'Obtiene indicadores de ventas, productos y stock bajo.'],
  ] as const) {
    server.registerTool(name, { description, inputSchema: {}, annotations: readAnnotations }, () => rest(path));
  }
  server.registerTool('create_product', {
    description: 'Crea un producto. Requiere administrador y mcp:write. Precios en céntimos.', inputSchema: productInput.shape, annotations: writeAnnotations,
  }, input => rest('/products', 'POST', productInput.parse(input)));
  server.registerTool('update_product', {
    description: 'Actualiza un producto. Requiere administrador y mcp:write.',
    inputSchema: { id: z.string().uuid(), changes: productUpdate }, annotations: writeAnnotations,
  }, ({ id, changes }) => rest(`/products/${id}`, 'PATCH', changes));
  server.registerTool('adjust_stock', {
    description: 'Ajusta existencias indicando delta y motivo. Requiere administrador y mcp:write.',
    inputSchema: { id: z.string().uuid(), ...inventoryInput.shape }, annotations: writeAnnotations,
  }, ({ id, ...input }) => rest(`/products/${id}/stock`, 'POST', inventoryInput.parse(input)));
  server.registerTool('create_sale', {
    description: 'Registra una venta y descuenta existencias. Requiere mcp:write.', inputSchema: saleInput.shape, annotations: writeAnnotations,
  }, input => rest('/sales', 'POST', saleInput.parse(input)));
  server.registerTool('cancel_sale', {
    description: 'Cancela una venta y devuelve sus existencias. Requiere administrador y mcp:write.',
    inputSchema: { id: z.string().uuid() }, annotations: writeAnnotations,
  }, ({ id }) => rest(`/sales/${id}/cancel`, 'POST'));
  return server;
}

export function createMcpRouter(config = readMcpConfig(), secret = process.env.JWT_SECRET || '', verifier?: OAuthTokenVerifier) {
  const router = Router();
  const metadataPath = '/.well-known/oauth-protected-resource/mcp';
  if (!config) {
    router.all(['/mcp', metadataPath, '/.well-known/oauth-protected-resource'], (_req, res) => {
      res.status(503).json({ error: 'Configura MCP_PUBLIC_URL, MCP_OAUTH_ISSUER y MCP_OAUTH_JWKS_URL para habilitar MCP' });
    });
    return router;
  }
  router.get([metadataPath, '/.well-known/oauth-protected-resource'], (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*').json({
      resource: config.resource.href, authorization_servers: [config.issuer],
      scopes_supported: mcpScopes, bearer_methods_supported: ['header'], resource_name: 'Mercato MCP',
    });
  });
  router.all('/mcp', (req, res, next) => {
    if (req.get('host') !== config.resource.host || (req.headers.origin && !config.allowedOrigins.includes(req.headers.origin))) {
      res.status(403).json({ error: 'Host u origen MCP no permitido' }); return;
    }
    res.vary('Origin');
    if (req.headers.origin) {
      res.set({
        'Access-Control-Allow-Origin': req.headers.origin,
        'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID',
        'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version',
      });
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  }, requireBearerAuth({
    verifier: verifier || createMcpVerifier(config), requiredScopes: ['mcp:read'],
    expectedResource: config.resource, resourceMetadataUrl: new URL(metadataPath, config.resource).href,
  }));
  router.post('/mcp', (req, res, next) => {
    // Una instancia por petición: no se comparte identidad ni estado entre clientes.
    const server = createServer(config, req.auth!, secret);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void server.close().catch(() => {}); });
    void (async () => {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    })().catch(next);
  });
  router.all('/mcp', (_req, res) => {
    res.set('Allow', 'POST, OPTIONS').status(405).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Transporte stateless: utiliza POST' } });
  });
  return router;
}
