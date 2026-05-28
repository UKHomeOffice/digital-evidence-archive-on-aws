/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { deaConfig } from '../../config';

export const addSnapshotSerializers = (): void => {
  expect.addSnapshotSerializer({
    test: (val) => typeof val === 'string' && (val.includes('zip') || val.includes('json')),
    print: (val) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const newVal = (val as string).replace(/([A-Fa-f0-9]{64})/g, '[HASH REMOVED]');
      return `"${newVal}"`;
    },
  });

  expect.addSnapshotSerializer({
    test: (val) => typeof val === 'string' && val.includes('sha384'),
    print: () => {
      const newVal = '[HASH REMOVED]';
      return `"${newVal}"`;
    },
  });

  expect.addSnapshotSerializer({
    test: (val) => typeof val === 'string' && val.includes('piDeployment'),
    print: () => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const newVal = 'DeaApiGatewaydeaapiDeployment-[HASH REMOVED]';
      return `"${newVal}"`;
    },
  });

  const stage = deaConfig.stage();
  const configName = deaConfig.configName()?.replace('.json', '');

  expect.addSnapshotSerializer({
    test: (val) =>
      typeof val === 'string' &&
      [stage, configName].some((value) => value !== undefined && val.includes(value)),
    print: (val) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const originalVal = val as string;

      const newVal1 = stage
        ? originalVal.replaceAll(stage, '[STAGE-REMOVED]')
        : originalVal;

      const newVal2 = configName
        ? newVal1.replaceAll(configName, '[STAGE-REMOVED]')
        : newVal1;

      const newVal = newVal2.replace(/([A-Fa-f0-9]{8})/g, '[HASH REMOVED]');
      return `"${newVal}"`;
    },
  });
  const domain = deaConfig.cognitoDomain();
  if (domain) {
    expect.addSnapshotSerializer({
      test: (val) => typeof val === 'string' && val.includes(domain),
      print: (val) => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const newVal1 = (val as string).replaceAll(domain, '[DOMAIN-REMOVED]');
        const newVal = newVal1.replace(/([A-Fa-f0-9]{8})/g, '[HASH REMOVED]');
        return `"${newVal}"`;
      },
    });
  }
};
