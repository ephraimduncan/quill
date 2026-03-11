/**
 * Creates a concurrency limiter that allows at most `concurrency`
 * async tasks to run simultaneously. Additional tasks are queued.
 *
 * Usage:
 *   const limit = createConcurrencyLimiter(5)
 *   items.forEach(item => limit(() => fetch(`/api/${item.id}`)))
 */
export function createConcurrencyLimiter(concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []

  function next() {
    if (queue.length === 0 || active >= concurrency) return
    active++
    const run = queue.shift()!
    run()
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--
            next()
          })
      })
      next()
    })
  }
}
