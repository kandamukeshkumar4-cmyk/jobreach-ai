FROM python:3.11-slim

# Install system deps: Playwright needs Chromium deps, supervisord
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor \
    curl \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright + Chromium
RUN playwright install chromium --with-deps

# Copy application code
COPY . .

# Supervisord config
COPY supervisord.conf /etc/supervisor/conf.d/jobreach.conf

EXPOSE 8000

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/jobreach.conf"]
