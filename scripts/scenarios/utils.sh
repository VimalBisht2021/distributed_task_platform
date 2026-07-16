#!/bin/bash

# ANSI colors
export GREEN='\033[0;32m'
export BLUE='\033[0;34m'
export YELLOW='\033[1;33m'
export RED='\033[0;31m'
export NC='\033[0m'

API_URL="http://localhost:3000"

function start_cluster() {
    echo -e "${BLUE}Starting cluster with $LAB_WORKERS workers and $LAB_SCHEDULERS schedulers...${NC}"
    docker compose up -d --scale worker-service=$LAB_WORKERS --scale scheduler-service=$LAB_SCHEDULERS
    
    echo "Waiting for services to be ready..."
    # Wait for API to respond
    until curl -s -o /dev/null -w "%{http_code}" $API_URL/metrics | grep -q "200\|404"; do
        sleep 1
        echo -n "."
    done
    echo -e "\n${GREEN}Cluster is up!${NC}"
}

function get_token() {
    # Attempt to login. If admin@system.local doesn't exist, we might need to register it.
    # We will try to register it first, ignoring errors if it exists.
    curl -s -X POST $API_URL/auth/register \
      -H "Content-Type: application/json" \
      -d '{"email": "admin@system.local", "password": "password123", "role": "ADMIN"}' > /dev/null

    local TOKEN=$(curl -s -X POST $API_URL/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email": "admin@system.local", "password": "password123"}' \
      | node -p "try { JSON.parse(require('fs').readFileSync(0, 'utf-8')).token } catch(e) { 'null' }")

    if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
        echo -e "${RED}Failed to authenticate. Is the API running and reachable?${NC}"
        exit 1
    fi
    echo "$TOKEN"
}

function submit_job() {
    local TOKEN=$1
    local PRIORITY=$2
    local LABEL=$3

    local RES=$(curl -s -X POST $API_URL/jobs \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"jobType\": \"TEST_JOB\", \"payload\": {\"label\": \"$LABEL\"}, \"priority\": \"$PRIORITY\"}")
    
    echo "$RES" | node -p "try { JSON.parse(require('fs').readFileSync(0, 'utf-8')).jobId } catch(e) { 'null' }"
}

function wait_for_job() {
    local TOKEN=$1
    local JOB_ID=$2
    
    echo -n "Waiting for job $JOB_ID to complete"
    while true; do
        local STATUS=$(curl -s -X GET $API_URL/jobs/$JOB_ID \
          -H "Authorization: Bearer $TOKEN" | node -p "try { JSON.parse(require('fs').readFileSync(0, 'utf-8')).status } catch(e) { 'null' }")
        
        if [ "$STATUS" == "COMPLETED" ]; then
            echo -e "\n${GREEN}Job $JOB_ID completed!${NC}"
            break
        elif [ "$STATUS" == "FAILED" ] || [ "$STATUS" == "null" ]; then
            echo -e "\n${RED}Job $JOB_ID failed or not found!${NC}"
            break
        fi
        sleep 1
        echo -n "."
    done
}
