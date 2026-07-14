export function getRetryDelay(retryCount: number): number {
  switch (retryCount) {
    case 1:
      return 10;
    case 2:
      return 30;
    case 3:
      return 60;
    case 4:
      return 120;
    default:
      return 120;
  }
}
