import { DurableObject } from 'cloudflare:workers';

export class FavaContainer extends DurableObject {
    // Default port the container listens on.
  defaultPort = 5005;
  // Set how long the container should stay active without requests
  sleepAfter = '5m';

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

  async fetch(request, attempt = 1) {
    console.log(attempt);

    // if (attempt >= 3) {
    //     // Give up – return a clear error response instead of looping forever.
    //     return new Response(
    //       `Container error after 3 attempts: ${err.message}`,
    //       { status: 502, headers: { 'Content-Type': 'text/plain' } }
    //     );
    //   }


    // // while (!this.container.healthy) {
    // //     console.log("waiting...");
    // //     await new Promise(resolve => setTimeout(resolve, 2000));
    // // }

    try {
    //   // Forward request to container on port 5005
    //   return await this.container.getTcpPort(5005).fetch(
    //     request.url.replace('https:', 'http:'),
    //     request
    //   );


        // Race getTcpPort against a timeout
        const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getTcpPort timeout')), 5000)
        );
        
        const fetchPromise = this.container.getTcpPort(5005).fetch(
        request.url.replace('https:', 'http:'),
        request
        );
        
        return await Promise.race([fetchPromise, timeoutPromise]);

    } catch (error) {
    //     console.log("waiting...");
        await new Promise(resolve => setTimeout(resolve, 3000));
    //     return this.fetch(request);


    if (attempt >= 3) {
      return new Response(`Container error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    }


    return this.fetch(request, attempt + 1);
  }
}

export default {
  async fetch(request, env, ctx) {
    // Get the durable object instance by name
    const id = env.FAVA_CONTAINER.idFromName("fava-session");
    const stub = env.FAVA_CONTAINER.get(id);

    // Intercept index because its not working from within the container
    const url = new URL(request.url);
    if (url.pathname === '/edit') {
      return stub.fetch(new Request('http://localhost:5005/beancount/income_statement/'));
    }

    try {

      // Forward the request to the durable object
      return await stub.fetch(request);
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}