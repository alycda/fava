import { DurableObject } from 'cloudflare:workers';

export class FavaContainer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.container = ctx.container;

    // Start the container if it's not already running
    void this.ctx.blockConcurrencyWhile(async () => {
      if (!this.container.running) {
        // Start both operations in parallel
        const [_, __] = await Promise.all([
          this.container.start({
            env: {
              FAVA_HOST: "0.0.0.0",
              FAVA_PORT: "5005"
            },
            enableInternet: false
          }),
          this.loadFromR2()
        ]);

        // Upload file to container (includes wait for readiness)
        await this.uploadFileToContainer();
      }
    });
  }

  async loadFromR2() {
    try {
      // Try to load the beancount file from R2
      const r2Object = await this.env.files.get('2026.beancount');
      if (r2Object) {
        const content = await r2Object.text();
        // Store in Durable Object storage
        await this.ctx.storage.put('beancount:current', content);
        console.log('Loaded beancount file from R2');
      } else {
        console.log('No beancount file found in R2, using default');
      }
    } catch (error) {
      console.error('Error loading from R2:', error.message);
    }
  }

  async waitForContainer(maxAttempts = 30) {
    // Wait for container to be ready by polling the health endpoint
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.container.getTcpPort(5005).fetch('http://localhost:5005/');
        if (response.status !== 500) {
          console.log(`Container ready after ${i + 1} attempts`);
          return true;
        }
      } catch (error) {
        // Container not ready yet, keep waiting
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.error('Container failed to start after', maxAttempts, 'seconds');
    return false;
  }

  async uploadFileToContainer() {
    try {
      const content = await this.ctx.storage.get('beancount:current');
      if (!content) {
        console.log('No content to upload');
        return;
      }

      // Wait for container to be ready
      const ready = await this.waitForContainer();
      if (!ready) {
        console.error('Container not ready, skipping file upload');
        return;
      }

      // Use Fava's existing PUT source API to write the file
      const response = await this.container.getTcpPort(5005).fetch(
        'http://localhost:5005/api/put_source',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: '/data/2026.beancount',
            source: content,
            sha256sum: '' // Initial upload, no previous hash
          })
        }
      );

      if (response.ok) {
        console.log('Successfully uploaded file to container');
      } else {
        console.error('Failed to upload file:', await response.text());
      }
    } catch (error) {
      console.error('Error uploading to container:', error.message);
    }
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);

      // Intercept write API calls to sync back to R2
      if (url.pathname.includes('/api/put_source') && request.method === 'POST') {
        // Clone request to read body
        const requestClone = request.clone();

        // Forward to container
        const response = await this.container.getTcpPort(5005).fetch(
          request.url.replace('https:', 'http:'),
          request
        );

        // If write was successful, sync to R2
        if (response.ok) {
          try {
            const body = await requestClone.json();
            if (body.source) {
              // Update Durable Object storage
              await this.ctx.storage.put('beancount:current', body.source);
              // Sync to R2
              await this.env.files.put('2026.beancount', body.source);
              console.log('Synced changes to R2');
            }
          } catch (e) {
            console.error('Error syncing to R2:', e.message);
          }
        }

        return response;
      }

      // Forward all other requests to container
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