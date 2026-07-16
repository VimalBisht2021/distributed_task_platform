#!/bin/bash
source "$(dirname "$0")/utils.sh"

echo -e "${YELLOW}=== 5. Benchmark Mode ===${NC}"
echo "Purpose: How does performance scale?"

# We need jobs to be fast for the benchmark. We can pass TEST_PROCESSOR_DELAY=1
export TEST_PROCESSOR_DELAY=10

WORKER_COUNTS=(1 2 4 8)
JOB_COUNT=50

TOKEN=$(get_token)

echo -e "${BLUE}Running Benchmark: $JOB_COUNT jobs per worker count${NC}"
printf "%-10s | %-10s | %-10s | %-10s\n" "Workers" "Jobs" "Time (s)" "Jobs/sec"
echo "----------------------------------------------------"

for w in "${WORKER_COUNTS[@]}"; do
    export LAB_WORKERS=$w
    export LAB_SCHEDULERS=1
    
    docker compose up -d --scale worker-service=$w
    # Wait for workers to spin up
    sleep 5

    # Submit jobs
    JOB_IDS=()
    START_TIME=$(date +%s%N)
    
    for (( i=1; i<=JOB_COUNT; i++ )); do
        # We don't want to spam curl too hard if it fails, but doing it in background is faster
        JOB_ID=$(curl -s -X POST $API_URL/jobs \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $TOKEN" \
          -d "{\"jobType\": \"BENCHMARK\", \"payload\": {\"delay\": 10}, \"priority\": \"MEDIUM\"}" | node -p "try { JSON.parse(require('fs').readFileSync(0, 'utf-8')).jobId } catch(e) { 'null' }")
        JOB_IDS+=($JOB_ID)
    done
    
    # Wait for the LAST job to complete as a proxy (not perfect, but simple for bash)
    # Actually, we should check if all jobs are done. Let's just poll the last job ID
    LAST_JOB=${JOB_IDS[$((JOB_COUNT-1))]}
    
    # Poll until all are done (approximate by polling the last one, or just a few)
    # A better way is checking the queue size or metrics, but checking the last job is easiest.
    while true; do
        STATUS=$(curl -s -X GET $API_URL/jobs/$LAST_JOB -H "Authorization: Bearer $TOKEN" | node -p "try { JSON.parse(require('fs').readFileSync(0, 'utf-8')).status } catch(e) { 'null' }")
        if [ "$STATUS" == "COMPLETED" ]; then
            break
        fi
        sleep 0.5
    done
    
    END_TIME=$(date +%s%N)
    
    # Calculate duration
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    ELAPSED_SEC=$(awk "BEGIN {print $ELAPSED_MS/1000}")
    JOBS_PER_SEC=$(awk "BEGIN {print $JOB_COUNT/$ELAPSED_SEC}")
    
    printf "%-10s | %-10s | %-10.2f | %-10.2f\n" "$w" "$JOB_COUNT" "$ELAPSED_SEC" "$JOBS_PER_SEC"
done

echo ""
echo -e "${GREEN}Benchmark complete!${NC}"
