// Reject asynchronous results started before an account/capture transition,
// including A -> paused -> A (which a plain identity comparison misses).
export function createCaptureScope() {
  let current = null;
  let generation = 0;
  return {
    update(identity) {
      if (identity !== current) { current = identity; generation++; }
    },
    ticket() { return generation; },
    accepts(ticket) { return current !== null && ticket === generation; },
  };
}
