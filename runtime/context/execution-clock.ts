export interface ExecutionClock {
    now(): Date;
}

export class DefaultExecutionClock implements ExecutionClock {
    now(): Date {
        return new Date();
    }
}
