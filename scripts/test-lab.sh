#!/bin/bash

# ANSI colors for nice output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================${NC}"
echo -e "${GREEN} Distributed Task Platform Test Lab${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Configuration variables
WORKERS=1
SCHEDULERS=1



# Ask for configuration
read -p "Number of Workers [1-20] (default: 3): " input_workers
WORKERS=${input_workers:-3}

read -p "Number of Schedulers [1-5] (default: 1): " input_schedulers
SCHEDULERS=${input_schedulers:-1}

echo ""
echo -e "${YELLOW}Active Configuration: ${WORKERS} Workers, ${SCHEDULERS} Schedulers${NC}"
echo ""

echo "Select Test Mode:"
echo ""
echo "1) Normal Mode          (Standard workload verification)"
echo "2) Priority Queue Mode  (Verify strict CRITICAL->HIGH->MEDIUM->LOW ordering)"
echo "3) Worker Recovery Mode (Kill worker mid-job and verify failover)"
echo "4) Leader Failover Mode (Kill active scheduler and verify takeover)"
echo "5) Benchmark Mode       (Test throughput across queue)"
echo "6) Stop Cluster         (Tear down all containers)"
echo ""
echo "0) Exit"
echo ""

read -p "Choice: " choice

echo ""

# Export variables for the scenario scripts to use
export LAB_WORKERS=$WORKERS
export LAB_SCHEDULERS=$SCHEDULERS

case $choice in
  1)
    bash ./scripts/scenarios/1-normal.sh
    ;;
  2)
    bash ./scripts/scenarios/2-priority.sh
    ;;
  3)
    bash ./scripts/scenarios/3-recovery.sh
    ;;
  4)
    bash ./scripts/scenarios/4-leader-failover.sh
    ;;
  5)
    bash ./scripts/scenarios/5-benchmark.sh
    ;;
  6)
    echo "Stopping cluster..."
    docker compose down
    ;;
  0)
    echo "Exiting."
    exit 0
    ;;
  *)
    echo -e "${RED}Invalid option${NC}"
    exit 1
    ;;
esac
