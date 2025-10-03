import { DurableObject } from 'cloudflare:workers';

export class FavaContainer extends DurableObject {
  // Port the Flask container listens on
  defaultPort = 5005;
  // How long the container stays active without requests
  sleepAfter = '5m';

  constructor(ctx, env) {
    super(ctx, env);
    this.container = ctx.container;
    this.initPromise = null;
    this.ready = false;

    // Start the container if it's not already running
    if (!this.container.running) {
      this.container.start({
        env: {
          FAVA_HOST: "0.0.0.0",
          FAVA_PORT: "5005"
        },
        enableInternet: false
      });
    }

    // Start health checking Flask in the background (non-blocking)
    this.initPromise = this.waitForFlask();
  }

  /**
   * Wait for Flask application to be ready by polling with health checks.
   *
   * BUG: getTcpPort().fetch() hangs indefinitely instead of rejecting when the port isn't ready.
   * Expected: fetch should fail/reject when Flask isn't listening yet
   * Actual: fetch never resolves or rejects, hanging forever
   *
   * Workaround: Race against a timeout promise to prevent infinite hangs
   */
  async waitForFlask(maxAttempts = 60) {
    console.log('Waiting for Flask to be ready...');

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Create a 3-second timeout to prevent getTcpPort().fetch() from hanging forever
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        );

        // Attempt to connect to Flask - this will hang if port isn't ready yet
        const fetchPromise = this.container.getTcpPort(5005).fetch(
          'http://localhost:5005/',
          { method: 'HEAD' }
        );

        // Race the fetch against timeout to avoid infinite hang
        const response = await Promise.race([fetchPromise, timeout]);

        console.log(`Flask ready on attempt ${i + 1}`);
        this.ready = true;
        return;
      } catch (error) {
        console.log(`Attempt ${i + 1}/60: ${error.message}`);
        // Continue to next attempt after 2 seconds
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Flask failed to start');
  }

  async fetch(request) {
    // Wait for Flask to be ready before processing requests
    if (!this.ready) {
      try {
        await this.initPromise;
      } catch (error) {
        return new Response(
          `Container failed to start: ${error.message}`,
          { status: 503 }
        );
      }
    }

    // Forward request to Flask container
    try {
      return await this.container.getTcpPort(5005).fetch(
        request.url.replace('https:', 'http:'),
        request
      );
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 502 });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    // Get the Durable Object instance by name (creates singleton)
    const id = env.FAVA_CONTAINER.idFromName("fava-session");
    const stub = env.FAVA_CONTAINER.get(id);

    // Route /index to income statement (workaround for container routing issue)
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return stub.fetch(new Request('http://localhost:5005/beancount/income_statement/'));
    }

    // Forward all other requests to the Durable Object
    try {
      return await stub.fetch(request);
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}