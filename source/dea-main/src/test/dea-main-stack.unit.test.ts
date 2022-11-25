/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { DeaMainStack } from '../dea-main-stack';

describe('DeaMainStack', () => {
  beforeAll(() => {
    process.env.STAGE = 'test';
  });

  afterAll(() => {
    delete process.env.STAGE;
  });

  it('synthesizes the way we expect', () => {
    const app = new cdk.App();

    // Create the DeaMainStack
    const deaMainStack = new DeaMainStack(app, 'DeaMainStack', {});

    // TODO
    // Prepare the stack for assertions.
    const template = Template.fromStack(deaMainStack);

    // Assert it creates the function with the correct properties...
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Description: 'Backend API',
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'index.handler',
      Runtime: Runtime.NODEJS_16_X.name,
    });

    // Assert it creates the api with the correct properties...
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Description: 'distribution api',
    });

    template.hasResourceProperties('AWS::S3::Bucket', {
      AccessControl: 'LogDeliveryWrite',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });

    expect.addSnapshotSerializer({
      test: (val) => typeof val === 'string' && val.includes('zip'),
      print: (val) => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const newVal = (val as string).replace(/([A-Fa-f0-9]{64})/, '[HASH REMOVED]');
        return `"${newVal}"`;
      },
    });

    expect(template).toMatchSnapshot();
  });
});
