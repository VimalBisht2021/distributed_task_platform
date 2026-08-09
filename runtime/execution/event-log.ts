import { ExecutionEvent } from './events';

export interface EventLog {
    append(event: ExecutionEvent): Promise<void>;
    appendBatch(events: ExecutionEvent[]): Promise<void>;
    getEvents(executionId: string, fromSequenceNumber?: number): Promise<ExecutionEvent[]>;
}

export class InMemoryEventLog implements EventLog {
    private logs = new Map<string, ExecutionEvent[]>();

    async append(event: ExecutionEvent): Promise<void> {
        return this.appendBatch([event]);
    }

    async appendBatch(events: ExecutionEvent[]): Promise<void> {
        for (const event of events) {
            if (!this.logs.has(event.executionId)) {
                this.logs.set(event.executionId, []);
            }
            
            const list = this.logs.get(event.executionId)!;
            
            // Check invariant: sequence number must be monotonically increasing and strictly contiguous
            if (list.length > 0) {
                const lastSeq = list[list.length - 1].sequenceNumber;
                if (event.sequenceNumber !== lastSeq + 1) {
                    throw new Error(`Invalid sequence number. Expected ${lastSeq + 1}, got ${event.sequenceNumber}`);
                }
            } else if (event.sequenceNumber !== 1) {
                throw new Error(`Invalid starting sequence number. Expected 1, got ${event.sequenceNumber}`);
            }

            // Append cloned event
            list.push(JSON.parse(JSON.stringify(event)));
        }
    }

    async getEvents(executionId: string, fromSequenceNumber: number = 1): Promise<ExecutionEvent[]> {
        const list = this.logs.get(executionId) || [];
        return JSON.parse(JSON.stringify(list.filter(e => e.sequenceNumber >= fromSequenceNumber)));
    }
}
