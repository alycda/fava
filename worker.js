import { DurableObject } from 'cloudflare:workers';

export class FavaContainer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.container = ctx.container;
    this.fileLoaded = false;

    // Start the container if it's not already running
    void this.ctx.blockConcurrencyWhile(async () => {
      if (!this.container.running) {
        // Start container and load R2 in parallel
        await Promise.all([
          this.container.start({
            env: {
              FAVA_HOST: "0.0.0.0",
              FAVA_PORT: "5005"
            },
            enableInternet: false
          }),
          this.loadFromR2()
        ]);
      }
    });
  }

  async loadFromR2() {
    try {
      const r2Object = await this.env.files.get('2026.beancount');
      if (r2Object) {
        const content = await r2Object.text();
        await this.ctx.storage.put('beancount:file', content);
        console.log('Loaded beancount file from R2');
      }
    } catch (error) {
      console.error('Error loading from R2:', error.message);
    }
  }

  async ensureFileLoaded() {
    if (this.fileLoaded) return;

    const content = await this.ctx.storage.get('beancount:file');
    if (!content) {
      console.log('No file to load');
      this.fileLoaded = true;
      return;
    }

    // Simple retry logic - try up to 10 times with 2 second delays
    for (let i = 0; i < 10; i++) {
      try {
        const response = await this.container.getTcpPort(5005).fetch(
          'http://localhost:5005/api/put_source',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_path: '/data/2026.beancount',
              source: content,
              sha256sum: ''
            })
          }
        );

        if (response.ok) {
          console.log('File loaded to container');
          this.fileLoaded = true;
          return;
        }
      } catch (error) {
        // Container not ready, wait and retry
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.error('Failed to load file after 10 attempts');
    this.fileLoaded = true; // Don't keep trying
  }

  async fetch(request) {
    try {
      // Load file on first request
      await this.ensureFileLoaded();

      const url = new URL(request.url);

      // Intercept writes to sync back to R2
      if (url.pathname.includes('/api/put_source') && request.method === 'POST') {
        const requestClone = request.clone();
        const response = await this.container.getTcpPort(5005).fetch(
          request.url.replace('https:', 'http:'),
          request
        );

        if (response.ok) {
          try {
            const body = await requestClone.json();
            if (body.source) {
              await this.ctx.storage.put('beancount:file', body.source);
              await this.env.files.put('2026.beancount', body.source);
              console.log('Synced to R2');
            }
          } catch (e) {
            console.error('Error syncing to R2:', e.message);
          }
        }

        return response;
      }

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
  async fetch(request, env) {
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
