#!/bin/bash
source "$(dirname "$0")/utils.sh"

echo -e "${YELLOW}=== 1. Normal Mode ===${NC}"
echo "Purpose: Does the platform work correctly under normal conditions?"

start_cluster
TOKEN=$(get_token)

echo "Submitting a normal payload job..."
JOB_ID=$(submit_job "$TOKEN" "MEDIUM" "Normal Job")

wait_for_job "$TOKEN" "$JOB_ID"

echo -e "${GREEN}Normal mode test completed successfully!${NC}"
