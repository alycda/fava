# Multi-stage build: Build frontend with Node.js then create Python runtime
FROM node:22-slim AS frontend-builder

WORKDIR /app

# Copy all source code (needed for build output path)
COPY . .

# Copy package files for Node.js dependencies (already included above)

# Install Node.js dependencies and build frontend
RUN cd frontend && npm install && npm run build

# Runtime stage with Python
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency management
RUN pip install uv

# Set version for setuptools-scm (fallback if git metadata unavailable)
ENV SETUPTOOLS_SCM_PRETEND_VERSION=1.0.0

# Copy source code (excluding frontend which will be copied from builder)
COPY . .

# Copy built assets from the builder stage (the build outputs to src/fava/static/)
COPY --from=frontend-builder /app/src/fava/static/ src/fava/static/

# Install dependencies and the application
RUN uv sync --frozen

# Create a non-root user
RUN useradd --create-home --shell /bin/bash fava
RUN chown -R fava:fava /app
USER fava

# Expose the default port
EXPOSE 5005

# Set environment variables
ENV FAVA_HOST=0.0.0.0
ENV FAVA_PORT=5005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5005/ || exit 1

# Default command (use uv to run from virtual environment)
CMD ["uv", "run", "fava", "--host", "0.0.0.0", "--port", "5005"]

# or run with:
#   docker run -p 5005:5005 -v ./beans/:/data/ fava-app uv run fava --host 0.0.0.0 --port 5005 /data/2026.beancount    