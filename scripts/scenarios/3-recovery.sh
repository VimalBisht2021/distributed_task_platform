#!/bin/bash
source "$(dirname "$0")/utils.sh"

echo -e "${YELLOW}=== 3. Worker Recovery Mode ===${NC}"
echo "Purpose: Can the cluster survive worker failures?"

# Ensure 1 worker and 1 scheduler
export LAB_WORKERS=1
export LAB_SCHEDULERS=1
start_cluster

TOKEN=$(get_token)

echo "Submitting a long-running job..."
JOB_ID=$(submit_job "$TOKEN" "HIGH" "Long Job")

# Wait 5 seconds for it to get picked up
sleep 5
echo "Killing the worker container to simulate a crash..."
docker stop distributed-task-platform-worker-service-1

echo "Worker killed. Waiting for heartbeat timeout and scheduler recovery (10-15s)..."
# Give scheduler time to notice the dead worker and requeue
sleep 15

echo "Starting a new worker..."
docker start distributed-task-platform-worker-service-1

# Wait for the new worker to finish it
wait_for_job "$TOKEN" "$JOB_ID"

echo -e "${GREEN}Worker recovery test completed successfully!${NC}"
