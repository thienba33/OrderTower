// SPDX-License-Identifier: Apache-2.0

// Vai trong Keycloak (client role của ordertower-web, xem
// infra/keycloak/realm/ordertower-realm.json) và tên vai tương ứng trong tệp
// định nghĩa luồng. Engine chỉ biết tên vai nghiệp vụ; việc dịch từ vai
// Keycloak sang vai nghiệp vụ nằm ở đây, 1 chỗ duy nhất.
export const KEYCLOAK_ROLE_TO_DEFINITION_ROLE: Record<string, string> = {
  admin: 'Quản trị viên',
  dispatcher: 'Điều phối viên',
  'warehouse-staff': 'Nhân viên kho',
  'customer-service': 'Nhân viên chăm sóc khách hàng',
  driver: 'Tài xế',
  manager: 'Quản lý',
  customer: 'Khách hàng mô phỏng',
};

export function mapKeycloakRolesToDefinitionRoles(
  keycloakRoles: string[],
): string[] {
  const mapped: string[] = [];
  for (const role of keycloakRoles) {
    const definitionRole = KEYCLOAK_ROLE_TO_DEFINITION_ROLE[role];
    if (definitionRole && !mapped.includes(definitionRole)) {
      mapped.push(definitionRole);
    }
  }
  return mapped;
}
