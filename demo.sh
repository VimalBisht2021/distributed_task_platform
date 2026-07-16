#!/bin/bash
sleep 5
echo "Creating a job..."
curl -s -X POST http://localhost:3000/jobs -H "Content-Type: application/json" -d '{"jobType":"long-running-job","payload":{"duration":30000},"priority":1,"userId":"test-user-1"}'
echo ""
sleep 2

WORKER=$(docker ps | grep task-platform-worker | awk '{print $1}' | head -n 1)
echo "Killing worker $WORKER..."
docker kill $WORKER
echo "Worker killed. Wait for scheduler to recover it..."
