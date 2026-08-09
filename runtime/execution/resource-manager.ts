export interface ResourceMetrics {
    availableWorkers: number;
    cpuUsage: number;
    memoryUsage: number;
    queueDepth: number;
}

/**
 * ResourceManager is focused strictly on observability.
 * It exposes metrics about the cluster/worker pool.
 * It does NOT make policy decisions (like whether to throttle or reject work).
 */
export interface ResourceManager {
    getMetrics(): ResourceMetrics;
}

export class InMemoryResourceManager implements ResourceManager {
    private metrics: ResourceMetrics = {
        availableWorkers: 10,
        cpuUsage: 0.1,
        memoryUsage: 0.2,
        queueDepth: 0
    };

    public getMetrics(): ResourceMetrics {
        return { ...this.metrics };
    }

    // Utility for testing
    public _simulateMetrics(metrics: Partial<ResourceMetrics>): void {
        this.metrics = { ...this.metrics, ...metrics };
    }
}
