import { DurableObject } from 'cloudflare:workers';

export class FavaContainer extends DurableObject {
    // Default port the container listens on.
  defaultPort = 5005;
  // Set how long the container should stay active without requests
  sleepAfter = '5m';

constructor(ctx, env) {
  super(ctx, env);
  this.container = ctx.container;
  this.initPromise = null;
  this.ready = false;

  // Start container immediately but DON'T block
  if (!this.container.running) {
    this.container.start({
      env: {
        FAVA_HOST: "0.0.0.0",
        FAVA_PORT: "5005"
      },
      enableInternet: false
    });
  }
  
  // Start initialization but don't await
  this.initPromise = this.waitForFlask();
}

// async waitForFlask(maxAttempts = 60) {
//   console.log('Waiting for Flask to be ready...');
  
//   for (let i = 0; i < maxAttempts; i++) {
//     try {
//       const response = await this.container.getTcpPort(5005).fetch(
//         'http://localhost:5005/',
//         { method: 'HEAD' }
//       );
      
//       console.log(`Flask ready on attempt ${i + 1}`);
//       this.ready = true;
//       return;
//     } catch (error) {
//       console.log(`Attempt ${i + 1}/60: ${error.message}`);
//     }
    
//     await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2s
//   }
  
//   throw new Error('Flask failed to start');
// }

async waitForFlask(maxAttempts = 60) {
  console.log('Waiting for Flask to be ready...');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Create timeout promise
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 3000)
      );
      
      // Race getTcpPort against timeout
      const fetchPromise = this.container.getTcpPort(5005).fetch(
        'http://localhost:5005/',
        { method: 'HEAD' }
      );
      
      const response = await Promise.race([fetchPromise, timeout]);
      
      console.log(`Flask ready on attempt ${i + 1}`);
      this.ready = true;
      return;
      
    } catch (error) {
      console.log(`Attempt ${i + 1}/60: ${error.message}`);
      // Continue to next attempt
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Flask failed to start');
}

async fetch(request) {
  // Wait for Flask if not ready yet
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

  // Forward to Flask
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