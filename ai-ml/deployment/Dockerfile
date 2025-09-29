# /ai-ml/deployment/Dockerfile
FROM tensorflow/tensorflow:2.8.0

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    POETRY_VERSION=1.1.13

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN pip install "poetry==$POETRY_VERSION"

# Set working directory
WORKDIR /app

# Copy only requirements to cache them in docker layer
COPY pyproject.toml poetry.lock ./

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-root

# Copy application code
COPY . .

# Install the package in development mode
RUN poetry install --no-interaction --no-ansi

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "inference.api.app:app", "--host", "0.0.0.0", "--port", "8000"]