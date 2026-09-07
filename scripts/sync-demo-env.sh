#!/usr/bin/env bash
# Sync the demo EC2 box's URL env vars + frontend builds to its current public IP.
#
# Why this exists: patient-pwa and staff-backoffice are served via `vite preview`
# (a static pre-built bundle) - VITE_API_URL/VITE_STAFF_API_URL get baked in at
# `vite build` time, not read live. Updating the Doppler secret alone (or just
# restarting pm2) does NOT change what the already-built JS calls. Every one of
# MAGIC_LINK_BASE_URL, PATIENT_APP_URL, STAFF_APP_URL, VITE_API_URL and
# VITE_STAFF_API_URL has to be updated AND both frontends rebuilt for a new IP
# to actually take effect. This script does the whole sequence in one shot so
# it never gets forgotten mid-way through again.
#
# Safe to run any time (idempotent) - even if the IP hasn't changed, it's a
# harmless refresh. With an Elastic IP attached this becomes unnecessary going
# forward, but keep it for the next time the box gets rebuilt/migrated.
set -euo pipefail

PROFILE="medassist-demo"
REGION="eu-north-1"
INSTANCE_ID="i-03dea29df47cbf6d4"
DOPPLER_PROJECT="medassist"
DOPPLER_CONFIG="stg_ec2_demo"
SSH_KEY="$HOME/Downloads/medassist-demo-key.pem"
SSH_USER="ubuntu"
REMOTE_DIR="~/MedAssist"

echo "Fetching current public IP..."
IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --profile "$PROFILE" --region "$REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

if [ -z "$IP" ] || [ "$IP" = "None" ]; then
  echo "Instance has no public IP (stopped?). Start it first." >&2
  exit 1
fi
echo "Public IP: $IP"

echo "Updating Doppler secrets ($DOPPLER_PROJECT/$DOPPLER_CONFIG)..."
doppler secrets set MAGIC_LINK_BASE_URL="http://$IP:5173/visit" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" >/dev/null
doppler secrets set PATIENT_APP_URL="http://$IP:5173" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" >/dev/null
doppler secrets set STAFF_APP_URL="http://$IP:5174" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" >/dev/null
doppler secrets set VITE_API_URL="http://$IP:3000" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" >/dev/null
doppler secrets set VITE_STAFF_API_URL="http://$IP:3000" --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" >/dev/null

ssh_run() {
  ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$SSH_USER@$IP" "$1"
}

echo "Rebuilding frontends on the box (this is the step that's easy to forget)..."
ssh_run "cd $REMOTE_DIR && doppler run -- pnpm --filter @medassist/patient-pwa build"
ssh_run "cd $REMOTE_DIR && doppler run -- pnpm --filter @medassist/staff-backoffice build"

echo "Restarting all processes so api/worker also pick up the new env..."
ssh_run "cd $REMOTE_DIR && pm2 delete all && doppler run -- pm2 start ecosystem.config.js && pm2 save"

echo ""
echo "Done. URLs:"
echo "  Patient PWA:  http://$IP:5173"
echo "  Staff BO:     http://$IP:5174"
echo "  API:          http://$IP:3000"
