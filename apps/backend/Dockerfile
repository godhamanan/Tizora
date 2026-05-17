# ── Base image ─────────────────────────────────────────────────────────────
# node:22-slim (Debian bookworm) — required for onnxruntime (needs glibc, not musl)
FROM node:22-slim

# ── System dependencies ─────────────────────────────────────────────────────
# python3-venv  — isolated Python environment
# libgl1        — OpenGL (required by some rembg/OpenCV transitive deps)
# libglib2.0-0  — GLib (required by OpenCV)
# libgomp1      — OpenMP (required by onnxruntime CPU parallel execution)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    libgl1 libglib2.0-0 libgomp1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Python virtual environment ──────────────────────────────────────────────
ENV VENV_PATH=/opt/venv
RUN python3 -m venv $VENV_PATH
ENV PATH="$VENV_PATH/bin:$PATH"
ENV PYTHON_BIN="$VENV_PATH/bin/python3"

# Install rembg and its runtime dependencies.
# onnxruntime is the CPU inference engine for the segmentation model.
RUN pip install --no-cache-dir \
    "rembg>=2.0.57" \
    "onnxruntime>=1.18.0" \
    "Pillow>=10.3.0"

# ── Pre-download rembg model ────────────────────────────────────────────────
# Baking the model into the Docker image avoids a cold-start download on
# first request (~176 MB). Build once, fast every deploy.
# Change REMBG_MODEL to "u2netp" (4.7 MB, faster) or "u2net" if preferred.
ENV REMBG_MODEL=isnet-general-use
ENV U2NET_HOME=/opt/u2net
RUN mkdir -p $U2NET_HOME \
    && python3 -c "from rembg import new_session; new_session('$REMBG_MODEL'); print('✅ rembg model ready')"

# ── Node.js setup ───────────────────────────────────────────────────────────
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm build

EXPOSE 7777
CMD ["node", "dist/index.js"]
