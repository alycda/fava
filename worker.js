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
   * Uses AbortSignal.timeout() to prevent hanging when the container port is open
   * but Flask isn't listening yet. Docker's HEALTHCHECK is defined but not exposed
   * through the Cloudflare Workers container API, so we poll manually.
   */
  async waitForFlask(maxAttempts = 60) {
    console.log('Waiting for Flask to be ready...');

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Use AbortSignal to timeout after 3 seconds if Flask isn't responding
        await this.container.getTcpPort(5005).fetch(
          'http://localhost:5005/',
          {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000)
          }
        );

        console.log(`Flask ready on attempt ${i + 1}`);
        this.ready = true;
        return;
      } catch (error) {
        console.log(`Attempt ${i + 1}/${maxAttempts}: ${error.message}`);
      }

      // Wait 2 seconds before next health check attempt
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Flask failed to start within timeout period');
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

    // // Route /index to income statement (workaround for container routing issue)
    // const url = new URL(request.url);
    // if (url.pathname === '/') {
    //   return stub.fetch(new Request('http://localhost:5005/beancount/income_statement/'));
    // }

    // Forward all other requests to the Durable Object
    try {
      return await stub.fetch(request);
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}