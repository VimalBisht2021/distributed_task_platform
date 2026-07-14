import { JobEventRepository } from "../repositories/job-event.repository";

export class EventService {
  private repository = new JobEventRepository();

  async createEvent(
    jobId: string,
    eventType: string,
    workerId?: string,
    details?: any
  ) {
    return this.repository.create(
      jobId,
      eventType,
      workerId,
      details
    );
  }
}