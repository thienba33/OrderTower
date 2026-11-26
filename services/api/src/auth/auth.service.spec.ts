// SPDX-License-Identifier: Apache-2.0
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { AuthService } from './auth.service';

const KID = 'test-key-1';

describe('AuthService', () => {
  const originalEnv = {
    internal: process.env.KEYCLOAK_INTERNAL_URL,
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
  };
  let server: Server;
  let baseUrl: string;
  let privateKey: CryptoKey;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    privateKey = keyPair.privateKey;
    const jwk = await exportJWK(keyPair.publicKey);
    jwk.kid = KID;
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    server = createServer((req, res) => {
      if (
        req.url === '/realms/ordertower/.well-known/openid-configuration'
      ) {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            issuer: `${baseUrl}/realms/ordertower`,
            jwks_uri: `${baseUrl}/realms/ordertower/protocol/openid-connect/certs`,
          }),
        );
      } else if (
        req.url === '/realms/ordertower/protocol/openid-connect/certs'
      ) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ keys: [jwk] }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.KEYCLOAK_INTERNAL_URL = baseUrl;
    delete process.env.KEYCLOAK_URL;
    process.env.KEYCLOAK_REALM = 'ordertower';
    process.env.KEYCLOAK_CLIENT_ID = 'ordertower-web';
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    for (const [key, value] of Object.entries(originalEnv)) {
      const envKey =
        key === 'internal'
          ? 'KEYCLOAK_INTERNAL_URL'
          : key === 'url'
            ? 'KEYCLOAK_URL'
            : key === 'realm'
              ? 'KEYCLOAK_REALM'
              : 'KEYCLOAK_CLIENT_ID';
      if (value === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = value;
      }
    }
  });

  async function signToken(options: {
    clientRoles?: string[];
    realmRoles?: string[];
    issuer?: string;
    expiresIn?: string;
    signWith?: CryptoKey;
  }): Promise<string> {
    return new SignJWT({
      realm_access: { roles: options.realmRoles ?? [] },
      resource_access: {
        'ordertower-web': { roles: options.clientRoles ?? [] },
      },
      preferred_username: 'son',
    })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuer(options.issuer ?? `${baseUrl}/realms/ordertower`)
      .setAudience('ordertower-web')
      .setSubject('user-son')
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '1h')
      .sign(options.signWith ?? privateKey);
  }

  it('xác thực token hợp lệ, lấy vai từ client role của Keycloak', async () => {
    const service = new AuthService();
    const token = await signToken({ clientRoles: ['dispatcher'] });
    await expect(service.verifyToken(token)).resolves.toEqual({
      userId: 'user-son',
      username: 'son',
      roles: ['Điều phối viên'],
    });
  });

  it('nhận cả vai realm_access', async () => {
    const service = new AuthService();
    const token = await signToken({ realmRoles: ['admin'] });
    const caller = await service.verifyToken(token);
    expect(caller.roles).toEqual(['Quản trị viên']);
  });

  it('token không có vai nào thì roles rỗng', async () => {
    const service = new AuthService();
    const token = await signToken({});
    const caller = await service.verifyToken(token);
    expect(caller.roles).toEqual([]);
  });

  it('từ chối token sai issuer, hết hạn hoặc sai khóa', async () => {
    const service = new AuthService();
    const wrongIssuer = await signToken({
      clientRoles: ['dispatcher'],
      issuer: 'http://localhost:9080/realms/khac',
    });
    await expect(service.verifyToken(wrongIssuer)).rejects.toThrow();
    const expired = await signToken({
      clientRoles: ['dispatcher'],
      expiresIn: '-1h',
    });
    await expect(service.verifyToken(expired)).rejects.toThrow();
    const otherKey = await generateKeyPair('RS256');
    const wrongKey = await signToken({
      clientRoles: ['dispatcher'],
      signWith: otherKey.privateKey,
    });
    await expect(service.verifyToken(wrongKey)).rejects.toThrow();
  });
});
