export async function withSingleNetworkRetry<T>(
  operation: () => Promise<T>,
  delayMs = 350,
): Promise<T> {
  try {
    return await operation();
  } catch (firstError) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      return await operation();
    } catch {
      throw firstError;
    }
  }
}
