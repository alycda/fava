export class FavaContainer {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    // This is the container handler - for now just a placeholder
    return new Response("Fava container is running", { status: 200 });
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      // Zero Trust authentication happens here automatically

      // Debug: Check if container binding exists
      if (!env.FAVA_CONTAINER) {
        return new Response("Container binding not found", { status: 500 });
      }

      // Get a Durable Object instance
      const id = env.FAVA_CONTAINER.idFromName("fava-instance");
      const obj = env.FAVA_CONTAINER.get(id);

      // Pass request to the Durable Object
      const response = await obj.fetch(request);

      // Add security headers
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('X-Frame-Options', 'DENY');
      newResponse.headers.set('X-Content-Type-Options', 'nosniff');

      return newResponse;
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
}