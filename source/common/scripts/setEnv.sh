#! /bin/bash

STACKPREFIX="${STAGE:-devsample}"
REGION="${AWS_REGION:-us-east-1}"
# cognito is not available in us-gov-east-1. If that is the target deployment region, we'll deploy cognito into us-gov-west-1
COGNITO_REGION=$([ "$REGION" = "us-gov-east-1" ] && echo "us-gov-west-1" || echo "$REGION")

# Build AWS CLI args safely
AWS_ARGS=()
if [ -n "${AWS_PROFILE:-}" ]; then
  AWS_ARGS+=(--profile "$AWS_PROFILE")
fi

log() { echo "[setEnv] $*"; }
# log() { echo "[setEnv][ERROR] $*" >&2; }

# Print execution context
if [ -n "${AWS_PROFILE:-}" ]; then
  log "Using AWS_PROFILE=$AWS_PROFILE"
else
  log "Using default AWS credential chain (no AWS_PROFILE set)"
fi
log "Using STAGE=$STACKPREFIX AWS_REGION=$REGION COGNITO_REGION=$COGNITO_REGION"

# Fail fast if credentials are invalid/expired
ACCOUNT_ID="$(aws sts get-caller-identity \
  --region "$REGION" \
  "${AWS_ARGS[@]}" \
  --query 'Account' \
  --output text 2>/dev/null || true)"

CALLER_ARN="$(aws sts get-caller-identity \
  --region "$REGION" \
  "${AWS_ARGS[@]}" \
  --query 'Arn' \
  --output text 2>/dev/null || true)"

[ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "None" ] && [ "$ACCOUNT_ID" != "null" ] \
  || log "Unable to resolve AWS identity (expired token, wrong profile, or missing creds)."

log "Resolved AWS account=$ACCOUNT_ID caller=$CALLER_ARN"

get_export() {
  local region="$1"
  local export_name="$2"
  local value
  value="$(aws cloudformation list-exports \
    --region "$region" \
    "${AWS_ARGS[@]}" \
    --query "Exports[?Name == '${export_name}'].Value | [0]" \
    --output text 2>/dev/null || true)"

  # AWS CLI may return "None" when query is empty
  if [ -z "$value" ] || [ "$value" = "None" ] || [ "$value" = "null" ]; then
    log "Missing CloudFormation export '${export_name}' in region '${region}' (check STAGE/AWS_REGION/profile)."
  fi

  printf '%s' "$value"
}

# Fetch and export required values
DEA_API_URL="$(get_export "$REGION" "${STACKPREFIX}-deaApiUrl")"
export DEA_API_URL

IDENTITY_POOL_ID="$(get_export "$COGNITO_REGION" "${STACKPREFIX}-identityPoolId")"
export IDENTITY_POOL_ID

USER_POOL_ID="$(get_export "$COGNITO_REGION" "${STACKPREFIX}-userPoolId")"
export USER_POOL_ID

USER_POOL_CLIENT_ID="$(get_export "$COGNITO_REGION" "${STACKPREFIX}-userPoolClientId")"
export USER_POOL_CLIENT_ID

DATASETS_BUCKET_NAME="$(get_export "$REGION" "${STACKPREFIX}-DeaS3Datasets")"
export DATASETS_BUCKET_NAME

AUDIT_BUCKET_NAME="$(get_export "$REGION" "${STACKPREFIX}-auditBucketName")"
export AUDIT_BUCKET_NAME

GLUE_DB="$(get_export "$REGION" "${STACKPREFIX}-athenaDBName")"
export GLUE_DB

GLUE_TABLE="$(get_export "$REGION" "${STACKPREFIX}-athenaTableName")"
export GLUE_TABLE

ATHENA_WORKGROUP_NAME="$(get_export "$REGION" "${STACKPREFIX}-athenaWorkgroupName")"
export ATHENA_WORKGROUP_NAME

AUDIT_LOG_GROUP="$(get_export "$REGION" "${STACKPREFIX}-auditLogName")"
export AUDIT_LOG_GROUP

TRAIL_LOG_GROUP="$(get_export "$REGION" "${STACKPREFIX}-trailLogName")"
export TRAIL_LOG_GROUP

FIREHOSE_STREAM_NAME="$(get_export "$REGION" "${STACKPREFIX}-firehoseName")"
export FIREHOSE_STREAM_NAME

DATASYNC_ROLE="$(get_export "$REGION" "${STACKPREFIX}-DeaDataSyncRole")"
export DATASYNC_ROLE

DATASYNC_REPORTS_ROLE="$(get_export "$REGION" "${STACKPREFIX}-DeaDataSyncReportsRole")"
export DATASYNC_REPORTS_ROLE

DATASYNC_REPORTS_BUCKET_NAME="$(get_export "$REGION" "${STACKPREFIX}-DeaDataSyncReportsBucketName")"
export DATASYNC_REPORTS_BUCKET_NAME

TABLE_NAME="$(get_export "$REGION" "${STACKPREFIX}-deaTableName")"
export TABLE_NAME

# Test-required ENV
IDENTITY_STORE_ID=dummyId
export IDENTITY_STORE_ID

IDENTITY_STORE_REGION=us-east-1
export IDENTITY_STORE_REGION

IDENTITY_STORE_ACCOUNT="555555555555"
export IDENTITY_STORE_ACCOUNT

HAS_AWS_MANAGED_ACTIVE_DIRECTORY=false
export HAS_AWS_MANAGED_ACTIVE_DIRECTORY
unset ADMIN_ROLE_ARN
