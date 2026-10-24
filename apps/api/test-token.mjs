import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL('http://localhost:8081/realms/mercato/protocol/openid-connect/certs'));

const token = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJpM29hSC1YbXcxUXVKRVdpT25JM1V2dTl0dGJORkM5M005X2RwbUJhOWFvIn0.eyJleHAiOjE3OTI4MDg0NTcsImlhdCI6MTc5MjgwODE1NywianRpIjoib2ZydHJvOjRhZmE1NTViLWFjZjgtZTBjOC1kOWI0LWUzOWIzMDc1YTBkNCIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODA4MS9yZWFsbXMvbWVyY2F0byIsImF1ZCI6Imh0dHA6Ly9sb2NhbGhvc3Q6NDAwMC9tY3AiLCJzdWIiOiJmYzNiZTBkYy02NmM0LTRhMmItYWRlZC1hNTg1MDlkNGYyZDAiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJtZXJjYXRvLWNsaSIsInNpZCI6IjJkMjRjN2VjLTA4NTctZGYzOS1jYTM5LTYyZWI5ZWJjMWQ4NyIsInNjb3BlIjoiYmFzaWMgbWNwOndyaXRlIG9mZmxpbmVfYWNjZXNzIG1jcDpyZWFkIGVtYWlsIHByb2ZpbGUgcm9sZXMiLCJtZXJjYXRvX3VzZXJfaWQiOiJmYzNiZTBkYy02NmM0LTRhMmItYWRlZC1hNTg1MDlkNGYyZDAifQ.d-Z61gW14daBfFuucn-Aw9oBMkZMpLNAfPl9LD7iSKAT7t85TYhqN9CaAu9nxvkjYWcn3IjJE-yOYmxd4G_5kuGCLC4UO_YjmRSmjFRQntqTlf7vzGf1zxkMMJyvXZ7aOvQ3PgUcr7TaiwnjoDUEZ5qfDOr_M5MFcIVCkOH4BrCwYb8xvSVu99vIBJRDIXW4MVF_uL4b_7DhMG4anwox0uAEEZZ_Nk_x9fkk23CczbXuohjBoPs0Pl82AtyKirW5wPWVGQWCpl6AD3U_5Sgjh16e_O3un6TNkA8rrOEoU3wjygmaA-HhZi5if2CJXJYRuQpW20TWGCKCe6lsPwS16g";

try {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: 'http://localhost:8081/realms/mercato',
    audience: 'http://localhost:4000/mcp',
    algorithms: ['RS256', 'PS256', 'ES256'],
    requiredClaims: ['exp', 'iat', 'sub'],
  });
  console.log('Token válido!');
  console.log('Payload:', JSON.stringify(payload, null, 2));
} catch (e) {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
}
