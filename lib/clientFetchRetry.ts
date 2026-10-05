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


export async function withTransientAuthRetry<T extends { status: number }>(
  operation: () => Promise<T>,
  delaysMs: number[] = [500, 1500, 3000],
): Promise<T> {
  let response = await operation();

  for (const delayMs of delaysMs) {
    if (response.status !== 401) return response;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    response = await operation();
  }

  return response;
}
