export class BackoffService {
  getDelayMs(retryCount: number): number {
    switch (retryCount) {
      case 1:
        return 10 * 1000;

      case 2:
        return 30 * 1000;

      case 3:
        return 60 * 1000;

      case 4:
        return 120 * 1000;

      default:
        return 120 * 1000;
    }
  }
}