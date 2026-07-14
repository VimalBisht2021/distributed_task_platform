import { ResultRepository } from "../repositories/result.repository";

export class ResultService {
  private repository = new ResultRepository();

  async createResult(
    jobId: string,
    resultType: string,
    resultUrl: string,
    size?: number
  ) {
    return this.repository.create(
      jobId,
      resultType,
      resultUrl,
      size
    );
  }
}