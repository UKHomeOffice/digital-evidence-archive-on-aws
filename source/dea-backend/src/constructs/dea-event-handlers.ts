/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { restrictAccountStatementStatementProps } from '@aws/dea-app/lib/storage/restrict-account-statement';
import { Duration, aws_events_targets } from 'aws-cdk-lib';
import { Rule } from 'aws-cdk-lib/aws-events';
import {
  ArnPrincipal,
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { CfnFunction, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { deaConfig } from '../config';
import { createCfnOutput } from './construct-support';
import { DeaOperationalDashboard } from './dea-ops-dashboard';

const DATASYNC_POST_PROCESSING_LAMBDA_EXECUTION_TIME_IN_SECONDS = 900;

interface LambdaEnvironment {
  [key: string]: string;
}

interface DeaEventHandlerProps {
  deaTableArn: string;
  deaDatasetsBucketArn: string;
  dataSyncLogsBucket: Bucket;
  lambdaEnv: LambdaEnvironment;
  kmsKey: Key;
  opsDashboard?: DeaOperationalDashboard;
}

export class DeaEventHandlers extends Construct {
  public s3BatchDeleteCaseFileLambda: NodejsFunction;
  public s3BatchDeleteCaseFileBatchJobRole: Role;
  public s3BatchDeleteCaseFileLambdaRole: Role;
  public dataSyncExecutionEventRole: Role;

  public constructor(scope: Construct, stackName: string, props: DeaEventHandlerProps) {
    super(scope, stackName);

    this.s3BatchDeleteCaseFileLambdaRole = this.createS3BatchDeleteCaseFileRole(
      's3-batch-delete-case-file-handler-role',
      props.deaTableArn,
      props.deaDatasetsBucketArn,
      props.kmsKey.keyArn
    );

    this.s3BatchDeleteCaseFileLambda = this.createLambda(
      `s3_batch_delete_case_file`,
      'S3BatchDeleteCaseFileLambda',
      '../../src/handlers/s3-batch-delete-case-file-handler.ts',
      props.lambdaEnv,
      this.s3BatchDeleteCaseFileLambdaRole
    );

    const statusHandlerRole = this.createS3BatchStatusChangeHandlerRole(
      's3-batch-status-change-handler-role',
      props.deaTableArn,
      props.deaDatasetsBucketArn,
      props.kmsKey.keyArn
    );

    const s3BatchJobStatusChangeHandlerLambda = this.createLambda(
      `s3_batch_status_handler`,
      'S3BatchJobStatusChangeLambda',
      '../../src/handlers/s3-batch-job-status-change-handler.ts',
      props.lambdaEnv,
      statusHandlerRole
    );

    this.s3BatchDeleteCaseFileBatchJobRole = this.createS3BatchRole(props.deaDatasetsBucketArn);

    props.kmsKey.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:GenerateDataKey*'],
        principals: [
          new ArnPrincipal(this.s3BatchDeleteCaseFileBatchJobRole.roleArn),
          new ArnPrincipal(this.s3BatchDeleteCaseFileLambdaRole.roleArn),
          new ArnPrincipal(statusHandlerRole.roleArn),
        ],
        resources: ['*'],
        sid: 'dea-event-handlers-key-share-statement',
      })
    );

    // create event bridge rule
    this.createEventBridgeRuleForS3BatchJobs(s3BatchJobStatusChangeHandlerLambda);

    props.opsDashboard?.addLambdaOperationalComponents(
      this.s3BatchDeleteCaseFileLambda,
      'S3BatchDeleteCaseFileLambda',
      undefined,
      true
    );
    props.opsDashboard?.addLambdaOperationalComponents(
      s3BatchJobStatusChangeHandlerLambda,
      'S3BatchJobStatusChangeLambda',
      undefined,
      true
    );

    // Create Lambda and event for DataSync
    this.dataSyncExecutionEventRole = this.createDataSyncExecutionEventRole(
      'data-sync-execution-event-role',
      props.deaTableArn,
      props.dataSyncLogsBucket.bucketArn,
      props.deaDatasetsBucketArn,
      props.kmsKey.keyArn
    );

    const dataSyncFileProcessingDLQ = new Queue(this, 'datasync-files-processing-dlq', {
      enforceSSL: true,
    });

    props.opsDashboard?.addDeadLetterQueueOperationalComponents(
      'DataSyncFilesProcessingDLQ',
      dataSyncFileProcessingDLQ
    );

    const dataSyncExecutionEventLambda = this.createLambda(
      `datasync_execution_event`,
      'DataSyncExecutionEventLambda',
      '../../src/handlers/datasync-execution-event-handler.ts',
      { NODE_OPTIONS: '--max-old-space-size=8192', ...props.lambdaEnv },
      this.dataSyncExecutionEventRole,
      DATASYNC_POST_PROCESSING_LAMBDA_EXECUTION_TIME_IN_SECONDS,
      512,
      2,
      dataSyncFileProcessingDLQ
    );

    props.opsDashboard?.addLambdaOperationalComponents(
      dataSyncExecutionEventLambda,
      'DataSyncExecutionEventLambda',
      undefined,
      true
    );

    this.createBucketEventForDataSyncExecution(dataSyncExecutionEventLambda, props.dataSyncLogsBucket);
  }

  private createBucketEventForDataSyncExecution(
    dataProcessingLambda: NodejsFunction,
    dataSyncLogsBucket: Bucket
  ) {
    dataSyncLogsBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(dataProcessingLambda),
      {
        prefix: 'Detailed-Reports',
      }
    );
  }

  private createEventBridgeRuleForS3BatchJobs(targetLambda: NodejsFunction) {
    new Rule(this, 'S3BatchJobStatusChangeRule', {
      enabled: true,
      eventPattern: {
        source: ['aws.s3'],
        detail: {
          eventSource: ['s3.amazonaws.com'],
          eventName: ['JobStatusChanged'],
        },
      },
      targets: [new aws_events_targets.LambdaFunction(targetLambda)],
    });
  }

  private createLambda(
    id: string,
    cfnExportName: string,
    pathToSource: string,
    lambdaEnv: LambdaEnvironment,
    role: Role,
    timeoutSeconds = 60,
    memorySize = 512,
    reservedConcurrentExecutions?: number,
    dlq?: Queue
  ): NodejsFunction {
    const lambdaProps: NodejsFunctionProps = {
      memorySize: memorySize,
      tracing: Tracing.ACTIVE,
      role,
      timeout: Duration.seconds(timeoutSeconds),
      reservedConcurrentExecutions,
      runtime: Runtime.NODEJS_18_X,
      handler: 'handler',
      // nosemgrep
      entry: path.join(__dirname, pathToSource),
      depsLockFilePath: path.join(__dirname, '../../../common/config/rush/pnpm-lock.yaml'),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        STAGE: deaConfig.stage(),
        ...lambdaEnv,
      },
      bundling: {
        externalModules: ['aws-sdk'],
        minify: true,
        sourceMap: true,
      },
      deadLetterQueue: dlq ? dlq : undefined,
      deadLetterQueueEnabled: dlq ? true : false,
    };

    const lambda = new NodejsFunction(this, id, lambdaProps);

    //CFN NAG Suppression
    const lambdaMetaDataNode = lambda.node.defaultChild;
    if (lambdaMetaDataNode instanceof CfnFunction) {
      lambdaMetaDataNode.addMetadata('cfn_nag', {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        rules_to_suppress: [
          {
            id: 'W58',
            reason:
              'AWSCustomResource Lambda Function has AWSLambdaBasicExecutionRole policy attached which has the required permission to write to Cloudwatch Logs',
          },
          {
            id: 'W92',
            reason: 'Reserved concurrency is currently not required. Revisit in the future',
          },
          {
            id: 'W89',
            reason:
              'The serverless application lens (https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/aws-lambda.html)\
               indicates lambdas should not be deployed in private VPCs unless they require access to resources also within a VPC',
          },
        ],
      });
    }

    createCfnOutput(this, cfnExportName, {
      value: lambda.functionArn,
    });

    return lambda;
  }

  private createS3BatchRole(datasetsBucketArn: string): Role {
    const role = new Role(this, 's3-batch-delete-case-file-role', {
      assumedBy: new ServicePrincipal('batchoperations.s3.amazonaws.com'),
    });

    role.addToPolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'],
        resources: [`${datasetsBucketArn}/manifests/*`, `${datasetsBucketArn}/reports/*`],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [this.s3BatchDeleteCaseFileLambda.functionArn],
      })
    );

    role.addToPolicy(new PolicyStatement(restrictAccountStatementStatementProps));

    return role;
  }

  private createS3BatchDeleteCaseFileRole(
    id: string,
    tableArn: string,
    datasetsBucketArn: string,
    kmsKeyArn: string
  ): Role {
    const basicExecutionPolicy = ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole'
    );
    const role = new Role(this, id, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [basicExecutionPolicy],
    });

    role.addToPolicy(
      new PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:UpdateItem'],
        resources: [tableArn],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: [
          's3:DeleteObject',
          's3:DeleteObjectVersion',
          's3:GetObjectLegalHold',
          's3:PutObjectLegalHold',
        ],
        resources: [`${datasetsBucketArn}/*`],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['s3:DescribeJob'],
        resources: ['*'],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [kmsKeyArn],
      })
    );

    return role;
  }

  private createS3BatchStatusChangeHandlerRole(
    id: string,
    tableArn: string,
    datasetsBucketArn: string,
    kmsKeyArn: string
  ): Role {
    const basicExecutionPolicy = ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole'
    );
    const role = new Role(this, id, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [basicExecutionPolicy],
    });

    role.addToPolicy(
      new PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [tableArn],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['s3:DescribeJob'],
        resources: ['*'],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [kmsKeyArn],
      })
    );

    return role;
  }

  private createDataSyncExecutionEventRole(
    id: string,
    tableArn: string,
    datasyncLogBucketArn: string,
    datasetsBucketArn: string,
    kmsKeyArn: string
  ): Role {
    const basicExecutionPolicy = ManagedPolicy.fromAwsManagedPolicyName(
      'service-role/AWSLambdaBasicExecutionRole'
    );
    const role = new Role(this, id, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [basicExecutionPolicy],
    });

    role.addToPolicy(
      new PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:BatchWriteItem',
          'dynamodb:Query',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [tableArn],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['datasync:DescribeTaskExecution', 'datasync:DescribeTask', 'datasync:DescribeLocationS3'],
        resources: ['*'],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [kmsKeyArn],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket', 's3:GetObjectVersion'],
        resources: [`${datasyncLogBucketArn}/*`],
      })
    );

    role.addToPolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket', 's3:GetObjectVersion'],
        resources: [`${datasetsBucketArn}/*`],
      })
    );

    return role;
  }
}
