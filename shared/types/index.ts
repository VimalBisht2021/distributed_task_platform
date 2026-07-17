export interface JobEventDto {
  id: string;
  jobId: string;
  eventType: string;
  workerId?: string;
  details?: any;
  createdAt: Date;
}

export interface JobDto {
  jobId: string;
  jobType: string;
  status: string;
  progress: number;
  workerId?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  events?: JobEventDto[];
}

export interface JobResultDto {
  jobId: string;
  resultType: string;
  resultUrl: string;
  size?: number;
  payload?: any;
  createdAt: Date;
}

export interface WorkerDto {
  workerId: string;
  status: string;
  capacity: number;
  currentLoad: number;
  startedAt: number;
}

export interface SystemMetricsDto {
  pending: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  retrying: number;
}

export interface WorkerMetricsDto {
  workers: WorkerDto[];
  activeWorkers: number;
  totalCapacity: number;
  currentLoad: number;
  utilization: number;
}

export interface SystemEventMessage {
  type: string;
  source: string;
  timestamp: string;
  jobId: string;
  payload?: any;
}
