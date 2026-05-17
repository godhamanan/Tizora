# ── Base image ─────────────────────────────────────────────────────────────
# node:22-slim (Debian bookworm) — required for onnxruntime (needs glibc, not musl)
FROM node:22-slim

# ── System dependencies ─────────────────────────────────────────────────────
# python3-venv  — isolated Python environment
# libgl1        — OpenGL (required by OpenCV transitive deps)
# libglib2.0-0  — GLib (required by OpenCV)
# libgomp1      — OpenMP (required by onnxruntime CPU parallel execution)
# curl          — small + useful for healthcheck debugging
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    libgl1 libglib2.0-0 libgomp1 \
    ca-certificates curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Python virtual environment ──────────────────────────────────────────────
ENV VENV_PATH=/opt/venv
RUN python3 -m venv $VENV_PATH
ENV PATH="$VENV_PATH/bin:$PATH"
ENV PYTHON_BIN="$VENV_PATH/bin/python3"
# Force Python stdout/stderr to be unbuffered — critical for stdin/stdout IPC
# with our background-removal worker (otherwise lines can sit in Python's
# internal buffer and Node thinks the worker is hung).
ENV PYTHONUNBUFFERED=1

# Install rembg + dependencies.
# Pinned to known-good versions to avoid "latest" pulling a breaking release.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
       "rembg==2.0.57" \
       "onnxruntime==1.19.2" \
       "Pillow==10.3.0" \
       "numpy<2.0"   # pinned: onnxruntime 1.19 not yet compatible with numpy 2.x

# ── Pre-download rembg model ────────────────────────────────────────────────
# Using u2netp (~4.7 MB) instead of isnet-general-use (~176 MB) for:
#   1. Far faster Docker builds (avoids Railway build-time limits)
#   2. ~3x faster per-image inference (~1-2s vs 4-6s)
#   3. Quality is "good enough" for wardrobe cards (clean garment + neutral bg)
#
# The build won't fail if model download fails — the worker will retry at
# runtime. This prevents a transient network blip from breaking the whole deploy.
ENV REMBG_MODEL=u2netp
ENV U2NET_HOME=/opt/u2net
RUN mkdir -p $U2NET_HOME \
    && (python3 -c "from rembg import new_session; new_session('$REMBG_MODEL'); print('✅ rembg model baked into image')" \
        || echo "⚠️  rembg model bake skipped (will download at runtime)")

# Smoke-test that rembg actually imports and the worker script parses.
# A failure here surfaces in the Docker build log before deploy.
COPY workers/bgremoval.py /tmp/bgremoval.py
RUN python3 -c "import rembg; print('✅ rembg import OK', rembg.__version__ if hasattr(rembg, '__version__') else '')" \
    && python3 -m py_compile /tmp/bgremoval.py \
    && echo "✅ worker script compiles"

# ── Node.js setup ───────────────────────────────────────────────────────────
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json ./
RUN pnpm install

COPY . .
RUN pnpm build

EXPOSE 7777
CMD ["node", "dist/index.js"]
