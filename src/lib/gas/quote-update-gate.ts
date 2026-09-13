/** Keeps an in-flight market quote from replacing a route being confirmed. */
export class QuoteUpdateGate {
  private paused = false;
  private request: AbortController | null = null;

  get canUpdate() {
    return !this.paused;
  }

  track(request: AbortController) {
    if (this.paused) {
      request.abort();
      return;
    }
    this.request = request;
  }

  release(request: AbortController) {
    if (this.request === request) this.request = null;
  }

  accepts(request: AbortController) {
    return this.canUpdate && !request.signal.aborted;
  }

  pause() {
    this.paused = true;
    this.request?.abort();
    this.request = null;
  }

  resume() {
    this.paused = false;
  }
}
