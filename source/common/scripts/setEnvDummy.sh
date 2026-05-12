export DEA_API_URL=dummyUrl
export STAGE=devsample
export CONFIGNAME=devsample
export AWS_REGION=us-east-1
export IDENTITY_POOL_ID=dummyId
export USER_POOL_ID=dummyPool
export USER_POOL_CLIENT_ID=dummyClient
export DATASETS_BUCKET_NAME=dummyBucket
export AUDIT_BUCKET_NAME=dummyAuditBucket
export ATHENA_WORKGROUP_NAME=dummyWorkgroup
export GLUE_TABLE=dummyTable
export GLUE_DB=dummyDb
export FIREHOSE_STREAM_NAME=dummyStream
export AUDIT_LOG_GROUP=deaAuditLogsDummy
export TRAIL_LOG_GROUP=deaTrailLogsDummy
export DATASYNC_REPORTS_BUCKET_NAME=dummySyncBucket
export DATASYNC_ROLE=dummyDatasyncRole
export DATASYNC_REPORTS_ROLE=dummyDatasyncReportsRole
export TABLE_NAME=dummyTable
export IDENTITY_STORE_ID=dummyId
export IDENTITY_STORE_REGION=us-east-1
export IDENTITY_STORE_ACCOUNT="555555555555"
export HAS_AWS_MANAGED_ACTIVE_DIRECTORY=false
unset ADMIN_ROLE_ARN

# Keep Jest compatible with ESM dependencies under Node by enabling vm modules.
VM_MODULES_FLAG="--experimental-vm-modules"
case " ${NODE_OPTIONS:-} " in
  *" ${VM_MODULES_FLAG} "*) ;;
  *) export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }${VM_MODULES_FLAG}" ;;
esac

