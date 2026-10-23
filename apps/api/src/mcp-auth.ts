import { createHmac } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export const mcpScopes = ['mcp:read', 'mcp:write'];
const restIssuer = 'mercato-mcp';
const restAudience = 'mercato-rest';

export type McpConfig = {
  resource: URL;
  issuer: string;
  jwksUrl: URL;
  userIdClaim: string;
  restUrl: URL;
  allowedOrigins: string[];
};

function secureUrl(value: string): URL {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) {
    throw new Error('Las URLs de MCP deben usar HTTPS (HTTP solo en loopback), sin credenciales, query ni fragmento');
  }
  return url;
}

export function readMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig | undefined {
  const values = [env.MCP_PUBLIC_URL, env.MCP_OAUTH_ISSUER, env.MCP_OAUTH_JWKS_URL];
  if (values.every(value => !value)) return undefined;
  if (values.some(value => !value)) throw new Error('Configura MCP_PUBLIC_URL, MCP_OAUTH_ISSUER y MCP_OAUTH_JWKS_URL');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('MCP requiere JWT_SECRET de al menos 32 caracteres');
  const resource = secureUrl(env.MCP_PUBLIC_URL!);
  if (resource.pathname !== '/mcp') throw new Error('MCP_PUBLIC_URL debe terminar en /mcp');
  secureUrl(env.MCP_OAUTH_ISSUER!);
  const restUrl = secureUrl(env.MCP_REST_URL || `http://127.0.0.1:${env.PORT || 4000}`);
  if (restUrl.pathname !== '/') throw new Error('MCP_REST_URL debe ser el origen de esta API REST');
  const allowedOrigins = [resource.origin, ...(env.MCP_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)];
  for (const origin of allowedOrigins) {
    if (secureUrl(origin).origin !== origin) throw new Error('MCP_ALLOWED_ORIGINS solo admite orígenes, sin rutas');
  }
  return { resource, issuer: env.MCP_OAUTH_ISSUER!, jwksUrl: secureUrl(env.MCP_OAUTH_JWKS_URL!), userIdClaim: env.MCP_USER_ID_CLAIM || 'sub', restUrl, allowedOrigins };
}

export function createMcpVerifier(config: McpConfig, key: JWTVerifyGetKey = createRemoteJWKSet(config.jwksUrl)): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: config.issuer,
          audience: config.resource.href,
          algorithms: ['RS256', 'PS256', 'ES256'],
          requiredClaims: ['exp', 'iat', 'sub'],
        });
        // Este claim debe establecerlo el proveedor, nunca el propio usuario.
        const userId = z.string().uuid().parse(payload[config.userIdClaim]);
        const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [];
        return {
          token, clientId: typeof payload.client_id === 'string' ? payload.client_id : payload.sub!,
          scopes, expiresAt: payload.exp, resource: config.resource, extra: { userId },
        };
      } catch {
        throw new InvalidTokenError('Token OAuth inválido o caducado');
      }
    },
  };
}

function restKey(secret: string) {
  if (secret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  // Clave distinta de la usada para las cookies del panel.
  return createHmac('sha256', secret).update('mercato:mcp:rest:v1').digest();
}

export async function createRestToken(auth: AuthInfo, secret: string): Promise<string> {
  const userId = z.string().uuid().parse(auth.extra?.userId);
  const expiresAt = Math.min(auth.expiresAt || 0, Math.floor(Date.now() / 1000) + 60);
  if (expiresAt <= Date.now() / 1000) throw new Error('Token OAuth caducado');
  return new SignJWT({ scope: auth.scopes.filter(scope => mcpScopes.includes(scope)).join(' ') })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(userId)
    .setIssuer(restIssuer).setAudience(restAudience).setIssuedAt().setExpirationTime(expiresAt).sign(restKey(secret));
}

export async function verifyRestToken(token: string, secret: string) {
  const { payload } = await jwtVerify(token, restKey(secret), {
    issuer: restIssuer, audience: restAudience, algorithms: ['HS256'], requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '60s',
  });
  return { userId: z.string().uuid().parse(payload.sub), scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [] };
}
