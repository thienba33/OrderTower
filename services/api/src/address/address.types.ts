// SPDX-License-Identifier: Apache-2.0

export interface AddressInput {
  province?: string;
  district?: string;
  ward?: string;
  street?: string;
}

export type AddressLevel = 'Tin cậy cao' | 'Cần lưu ý' | 'Rủi ro cao';

export interface AddressEvaluation {
  trust: number;
  level: AddressLevel;
  provinceKnown: boolean;
  districtKnown: boolean;
  wardKnown: boolean;
  hasStreet: boolean;
}

export interface GazetteerDistrict {
  name: string;
  wards: string[];
}

export interface GazetteerProvince {
  name: string;
  districts: GazetteerDistrict[];
}
