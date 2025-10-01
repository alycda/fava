import { DurableObject } from 'cloudflare:workers';

export class FavaContainer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.container = ctx.container;

    // Start the container if it's not already running
    void this.ctx.blockConcurrencyWhile(async () => {
      if (!this.container.running) {
        await this.container.start({
          env: {
            FAVA_HOST: "0.0.0.0",
            FAVA_PORT: "5005"
          },
          enableInternet: false
        });
      }
    });
  }

  async fetch(request) {
    try {
      // Forward request to container on port 5005
      return await this.container.getTcpPort(5005).fetch(
        request.url.replace('https:', 'http:'),
        request
      );
    } catch (error) {
      return new Response(`Container error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      // Get the durable object instance by name
      const id = env.FAVA_CONTAINER.idFromName("fava-session");
      const stub = env.FAVA_CONTAINER.get(id);

      // Forward the request to the durable object
      return await stub.fetch(request);
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}