// Share only outstanding requests, never persist repo data in the browser. A
// successful action is a barrier: a response begun before it must be read again.
export function createViewRequests(read, limit = 64) {
  let generation = 0;
  const pending = new Map();
  const get = (key) => {
    if (pending.has(key)) return pending.get(key);
    const started = generation;
    const promise = Promise.resolve().then(() => read(key)).then(
      (data) => started === generation ? data : get(key),
      (error) => { if (started !== generation) return get(key); throw error; },
    ).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
    // Limit bookkeeping even if a disconnected tab starts many distinct reads.
    if (pending.size < limit) pending.set(key, promise);
    return promise;
  };
  return { get, invalidate() { generation++; pending.clear(); } };
}
