/**
 * Thrown by {@link waitInclusionProof} when the wait is aborted, whether the
 * caller's abort signal fires while a poll request is in flight, while its
 * response is being verified, or while sleeping between polls.
 */
export class SleepError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SleepError';
  }
}

/**
 * Build the error reported when the caller's abort signal has fired. Nothing
 * here may throw: it runs inside the `abort` listeners, and an exception there
 * would skip the `reject` that ends the wait — the very hang this module
 * guards against.
 *
 * @param {AbortSignal} signal Aborted signal.
 * @returns {SleepError} Error carrying the signal's abort reason.
 */
export function createAbortError(signal: AbortSignal): SleepError {
  let reason: Error | undefined;
  let message = 'Wait was aborted';
  try {
    reason = signal.reason as Error | undefined;
    if (reason != null) {
      message = reason.toString();
    }
  } catch {
    // A signal whose reason cannot be read or described still has to end the wait.
  }

  return new SleepError(message, { cause: reason });
}

/**
 * Detach an abort listener without letting a hostile or exotic signal break
 * the wait. The listeners are one-shot, so a refused removal is harmless.
 *
 * @param {AbortSignal} signal Signal the listener was attached to.
 * @param {Function} listener Listener to detach.
 */
export function removeAbortListener(signal: AbortSignal, listener: () => void): void {
  try {
    signal.removeEventListener('abort', listener);
  } catch {
    // Cleanup is best effort; failing it must not leave a promise unsettled.
  }
}

/**
 * Stop the wait immediately if the signal has already fired.
 *
 * @param {AbortSignal} signal Signal to inspect.
 * @throws {SleepError} If the signal is aborted.
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError(signal);
  }
}

/**
 * Run one poll bounded by the caller's signal. The poll is handed a fresh
 * signal of its own so that the abort reaches the transport as a plain
 * `AbortSignal` — callers may pass any signal-like wrapper — and cancels only
 * this request. The wait settles as soon as either the poll settles or the
 * signal fires, so a poll that ignores its signal, or never responds at all,
 * still cannot outlive the caller's deadline.
 *
 * @param {Function} poll Runs one poll with the request's own abort signal.
 * @param {AbortSignal} signal Signal that ends the wait.
 * @returns {Promise} Promise settling with the poll, or rejecting on abort.
 * @throws {SleepError} If the signal fires before the poll settles.
 */
export function abortable<T>(poll: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new AbortController();

    function onAbort(): void {
      // Reject first: the wait must end even if cancelling the request does not.
      const error = createAbortError(signal);
      reject(error);
      request.abort(error.cause);
    }

    // An already-aborted signal never dispatches `abort` again, so a listener
    // attached now would never fire: check first, subscribe second.
    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
    // Both outcomes stay handled, so a poll that rejects after the wait has
    // already been abandoned is not reported as an unhandled rejection.
    void poll(request.signal)
      .then(resolve, reject)
      .finally(() => removeAbortListener(signal, onAbort));
  });
}

/**
 * Wait for the given delay, unless the signal fires first.
 *
 * @param {number} ms Delay in milliseconds.
 * @param {AbortSignal} signal Signal that ends the wait.
 * @returns {Promise<void>} Promise resolving once the delay has elapsed.
 * @throws {SleepError} If the signal is or becomes aborted.
 */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Same lost-abort hazard as above: an `abort` listener registered after the
    // signal has fired is never called, which would leave the poll loop running
    // for the lifetime of the process.
    if (signal.aborted) {
      reject(createAbortError(signal));
      return;
    }

    const timeout = setTimeout(() => {
      removeAbortListener(signal, onAbort);
      resolve();
    }, ms);

    function onAbort(): void {
      clearTimeout(timeout);
      reject(createAbortError(signal));
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A signal that aborts when either input does (`AbortSignal.any` needs a recent browser). Call `dispose` when the work is
 * done, so no listener stays on the long lived input.
 *
 * @param {AbortSignal} first Signal to join.
 * @param {AbortSignal} second Signal to join.
 * @returns {object} The joined signal and its cleanup.
 */
export function joinSignals(first: AbortSignal, second: AbortSignal): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const onFirst = (): void => controller.abort(first.reason);
  const onSecond = (): void => controller.abort(second.reason);
  if (first.aborted) {
    onFirst();
  } else if (second.aborted) {
    onSecond();
  } else {
    first.addEventListener('abort', onFirst, { once: true });
    second.addEventListener('abort', onSecond, { once: true });
  }
  return {
    dispose: (): void => {
      removeAbortListener(first, onFirst);
      removeAbortListener(second, onSecond);
    },
    signal: controller.signal,
  };
}
