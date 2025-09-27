export class FavaContainer {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;

    // Start the container if it's not already running
    this.ctx.blockConcurrencyWhile(async () => {
      if (!this.containerStarted) {
        await this.ctx.container.start({
          env: {
            FAVA_HOST: "0.0.0.0",
            FAVA_PORT: "5005"
          },
          enableInternet: false
        });
        this.containerStarted = true;

        // Monitor container status
        this.ctx.container.monitor()
          .then(() => console.log("Fava container exited"))
          .catch(err => console.log("Fava container errored", err));
      }
    });
  }

  async fetch(request) {
    try {
      // Check if container is available
      if (!this.ctx.container) {
        return new Response("Container context not available", { status: 500 });
      }

      // Get the Fetcher object for port 5005
      const containerFetcher = await this.ctx.container.getTcpPort(5005);

      // Use the Fetcher to make the request to the container
      const response = await containerFetcher.fetch(request);

      return response;

    } catch (error) {
      return new Response(`Container access error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      // Zero Trust authentication happens here automatically

      // Let's try a direct approach - maybe the container is accessible via env
      if (env.FAVA_CONTAINER) {
        // If this is the container binding, try to use it directly
        try {
          const response = await env.FAVA_CONTAINER.fetch(request);
          return response;
        } catch (e) {
          // If that doesn't work, fall back to Durable Object
          const id = env.FAVA_CONTAINER.idFromName("fava-session");
          const obj = env.FAVA_CONTAINER.get(id);
          const response = await obj.fetch(request);

          // Add security headers
          const newResponse = new Response(response.body, response);
          newResponse.headers.set('X-Frame-Options', 'DENY');
          newResponse.headers.set('X-Content-Type-Options', 'nosniff');

          return newResponse;
        }
      }

      return new Response("No container binding found", { status: 500 });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}