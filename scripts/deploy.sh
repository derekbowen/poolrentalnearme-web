#!/usr/bin/env bash

set -e

SECONDS=0

source ./scripts/set_environment.sh

# set up aws credentials for getting the env file
aws configure set aws_access_key_id ${AWS_ENV_USER_ACCESS_KEY_ID} --profile $TEMPORARY_SESSION_NAME && aws configure set aws_secret_access_key ${AWS_ENV_USER_SECRET_ACCESS_KEY} --profile $TEMPORARY_SESSION_NAME && aws configure set region "$AWS_ENV_USER_REGION" && aws configure set output "text" --profile $TEMPORARY_SESSION_NAME

echo -e "${COLOR}:::::::::Deploying $GITHUB_BASE_REF by the CI:::::::::${NC}"
# download and convert env from json to .env
echo -e "${COLOR}::::Decoding env file::::${NC}"
aws secretsmanager get-secret-value --secret-id ${AWS_JH_ENV_SECRET_NAME} --region=${AWS_ENV_USER_REGION} --query SecretString --output text --profile $TEMPORARY_SESSION_NAME >.env.json
./scripts/json2env.sh .env.json .env

# Split the retrieved environment into its two halves.
#
# .env.build : the VITE_-prefixed public config. Vite compiles these into the
#              browser bundle, so they are public by construction. The build
#              stage needs them as a FILE because vite.config.mjs populates
#              import.meta.env only from .env files (loadEnv), never from
#              process.env — the exact mechanism behind the c158 cookie failure.
# .env       : the full set, including secrets. It is NOT copied into any image
#              layer any more (.dockerignore blocks it, the Dockerfile no longer
#              copies it); it is delivered to the instance and passed to
#              `docker run --env-file` at container start.
grep -E '^VITE_' .env > .env.build || true
echo -e "${COLOR}::::build-time public config: $(wc -l < .env.build) VITE_ variables::::${NC}"

# decode the encoded permission file
echo -e "${COLOR}::::Decoding permission file::::${NC}"

if [ "$USE_SSH_DEPLOYMENT" == "TRUE" ]; then
  echo ${ENCODED_PEM} | base64 --decode >${AWS_PRIVATE_KEY_PATH}
  chmod 400 ${AWS_PRIVATE_KEY_PATH}
fi

# Runtime secrets travel to the instance over scp and live only on its disk,
# mode 600. They are passed to the container with `docker run --env-file`, so
# they never become an image layer. The on-box deploy script receives the path
# as $ENV_FILE.
REMOTE_ENV_FILE="/home/ubuntu/.prnm-runtime.env"

ship_runtime_env() {
  local target="$1"
  echo -e "${COLOR}::::delivering runtime env to ${target} (not baked into the image)::::${NC}"
  scp -o StrictHostKeyChecking=no -i "${AWS_PRIVATE_KEY_PATH}" .env "${target}:${REMOTE_ENV_FILE}"
  ssh -o StrictHostKeyChecking=no -i "${AWS_PRIVATE_KEY_PATH}" "${target}" "chmod 600 ${REMOTE_ENV_FILE}"
}

echo -e "${COLOR}::::will deploy with tag >>${AWS_ECR_TAG_NAME}<<::::${NC}"
docker build -t ${AWS_ECR_REPO_URL} . --platform linux/amd64

# Gate: the image must contain no production secret before it can leave this
# machine. Anyone with ECR pull access can read image layers, so this runs
# BEFORE the push, not after. Non-zero here aborts the deploy with production
# untouched.
echo -e "${COLOR}::::auditing image for baked-in secrets::::${NC}"
if ! bash ./scripts/audit-image-secrets.sh "${AWS_ECR_REPO_URL}" --reference-env .env; then
  echo -e "${ERR}::::ABORT: the image contains production secrets. Nothing pushed, nothing deployed.::::${NC}"
  rm -f .env.json .env.build $AWS_PRIVATE_KEY_PATH
  exit 1
fi

echo -e "${COLOR}::::login aws::::${NC}"

docker login -u AWS -p $(aws ecr get-login-password --region ${AWS_ECR_REGION} ${AWS_PROFILE_PARAM}) ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_ECR_REGION}.amazonaws.com

echo -e "${COLOR}::::pushing to aws repo::::${NC}"
docker push ${AWS_ECR_REPO_URL}

if [ "$USE_SSH_DEPLOYMENT" == "TRUE" ]; then
  if [ -z "${AWS_INSTANCE_URLS}" ]; then
    echo -e "${COLOR}::::ssh and deploy for single instance::::${NC}"
    ship_runtime_env "${AWS_INSTANCE_URL}"
    ssh -o StrictHostKeyChecking=no -i "${AWS_PRIVATE_KEY_PATH}" ${AWS_INSTANCE_URL} "IMAGE_URL=${AWS_ECR_REPO_URL} REGION=${AWS_ECR_REGION} ENV_FILE=${REMOTE_ENV_FILE} ${AWS_INSTANCE_DEPLOY_SCRIPT}"
  else
    echo -e "${COLOR}::::ssh and deploy for multiple instances::::${NC}"
    echo $AWS_INSTANCE_URLS | tr ',' '\n' | while read CURRENT_AWS_INSTANCE_URL
    do
      echo "Processing $CURRENT_AWS_INSTANCE_URL"
      ship_runtime_env "${CURRENT_AWS_INSTANCE_URL}"
      ssh -o StrictHostKeyChecking=no -i "${AWS_PRIVATE_KEY_PATH}" ${CURRENT_AWS_INSTANCE_URL} "IMAGE_URL=${AWS_ECR_REPO_URL} REGION=${AWS_ECR_REGION} ENV_FILE=${REMOTE_ENV_FILE} ${AWS_INSTANCE_DEPLOY_SCRIPT}"
    done
  fi
else
  echo -e "${COLOR}:::::::::::::Deploy by other alternatives::::::::::::::${NC}"
fi

aws configure set aws_access_key_id "" --profile $TEMPORARY_SESSION_NAME && aws configure set aws_secret_access_key "" --profile $TEMPORARY_SESSION_NAME
rm -f $AWS_PRIVATE_KEY_PATH
rm -f .env.json .env.build

duration=$SECONDS
echo -e "${COLOR}::::::::$(($duration / 60)) minutes and $(($duration % 60)) seconds deployment time.${NC}"
