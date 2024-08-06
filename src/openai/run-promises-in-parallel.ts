export async function mapPromisesParallel<T, U>(
  numParallel: number,
  items: T[],
  fn: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const result = await fn(items[currentIndex], currentIndex);
      results.push(result);
    }
  }

  const workers = Array.from({ length: numParallel }, worker);
  await Promise.all(workers);

  return results;
}
