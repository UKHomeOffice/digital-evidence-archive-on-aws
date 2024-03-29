/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { PropertyFilterProperty } from '@cloudscape-design/collection-hooks';
import { PropertyFilterProps } from '@cloudscape-design/components';

export const filteringProperties: readonly PropertyFilterProperty[] = [
  {
    key: 'name',
    operators: ['=', '!=', ':', '!:'],
    propertyLabel: 'Data Vault Name',
    groupValuesLabel: 'Data Vault Name Values',
  },
];

export const searchableColumns: string[] = ['name'];

export const filteringOptions: readonly PropertyFilterProps.FilteringOption[] = [
  { propertyKey: 'name', value: '' },
];
