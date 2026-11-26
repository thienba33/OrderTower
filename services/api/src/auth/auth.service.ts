// SPDX-License-Identifier: Apache-2.0
import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Caller } from './auth.types';
import { mapKeycloakRolesToDefinitionRoles } from './roles';

interface OpenIdConfiguration {
  issuer?: unknown;
  jwks_uri?: unknown;
}

// Xác thực access token Keycloak bằng JWKS. Lấy issuer từ tài liệu discovery
// (issuer trong token luôn là URL công khai KC_HOSTNAME, kể cả khi API lấy
// discovery qua URL nội bộ), nhưng lấy khóa qua URL nội bộ vì jwks_uri trong
// discovery trỏ về URL công khai mà container API không tới được.
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly keycloakBase: string;
  private readonly realm: string;
  private readonly clientId: string;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private issuer = '';

  constructor() {
    this.keycloakBase = (
      process.env.KEYCLOAK_INTERNAL_URL ??
      process.env.KEYCLOAK_URL ??
      'http://keycloak:8080'
    ).replace(/\/$/, '');
    this.realm = process.env.KEYCLOAK_REALM ?? 'ordertower';
    this.clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'ordertower-web';
  }

  async verifyToken(token: string): Promise<Caller> {
    const jwks = await this.getJwks();
    const { payload } = await jwtVerify(token, jwks, {
      issuer: this.issuer,
      audience: this.clientId,
    });
    const keycloakRoles: string[] = [
      ...toStringArray(
        (
          payload.realm_access as Record<string, unknown> | undefined
        )?.roles,
      ),
      ...toStringArray(
        (
          payload.resource_access as
            | Record<string, Record<string, unknown> | undefined>
            | undefined
        )?.[this.clientId]?.roles,
      ),
    ];
    return {
      userId: typeof payload.sub === 'string' ? payload.sub : '',
      username:
        typeof payload.preferred_username === 'string'
          ? payload.preferred_username
          : typeof payload.sub === 'string'
            ? payload.sub
            : '',
      roles: mapKeycloakRolesToDefinitionRoles(keycloakRoles),
    };
  }

  private async getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
    if (this.jwks) {
      return this.jwks;
    }
    const discoveryUrl = `${this.keycloakBase}/realms/${this.realm}/.well-known/openid-configuration`;
    let discovery: OpenIdConfiguration;
    try {
      const response = await fetch(discoveryUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      discovery = (await response.json()) as OpenIdConfiguration;
    } catch (error) {
      throw new Error(
        `Không lấy được tài liệu discovery của Keycloak tại ${discoveryUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (typeof discovery.issuer !== 'string' || discovery.issuer === '') {
      throw new Error(
        `Tài liệu discovery của Keycloak tại ${discoveryUrl} thiếu issuer.`,
      );
    }
    this.issuer = discovery.issuer;
    // JWKS lấy qua URL nội bộ, không dùng jwks_uri trong discovery vì nó
    // trỏ về URL công khai mà container API không tới được.
    const jwksUrl = `${this.keycloakBase}/realms/${this.realm}/protocol/openid-connect/certs`;
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    this.logger.log(`Đã nạp JWKS của Keycloak (${this.issuer}).`);
    return this.jwks;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}
