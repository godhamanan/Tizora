#!/usr/bin/env python3
"""
Persistent rembg background-removal worker.

Protocol (line-delimited JSON over stdin/stdout):
  Node → Python  stdin:  {"data": "<base64 JPEG/PNG>"}
  Python → Node  stdout: {"ok": true,  "data": "<base64 RGBA PNG>"}
                       or {"ok": false, "error": "<message>"}

First stdout line on startup: {"ready": true, "model": "..."}
so Node can wait before sending tasks.
"""
import sys
import json
import base64
import traceback
import os

def main() -> None:
    model_name = os.environ.get("REMBG_MODEL", "u2netp")

    try:
        from rembg import remove, new_session  # type: ignore
        import onnxruntime as ort  # type: ignore
    except ImportError as exc:
        print(json.dumps({"ready": False, "error": f"rembg not installed: {exc}"}), flush=True)
        sys.exit(1)

    # Memory-conscious ONNX session options.
    # Railway containers have limited RAM (~512MB-1GB). Aggressive parallelism
    # and memory pattern caching can push us into OOM-kill territory.
    sess_opts = ort.SessionOptions()
    sess_opts.intra_op_num_threads = 1   # 1 thread per op (less peak RAM)
    sess_opts.inter_op_num_threads = 1   # 1 thread between ops
    sess_opts.enable_mem_pattern   = False  # disable mem-pattern caching
    sess_opts.enable_cpu_mem_arena = False  # disable arena allocator

    try:
        session = new_session(model_name, sess_opts=sess_opts)
    except TypeError:
        # Older rembg versions don't accept sess_opts kwarg — fall back gracefully
        session = new_session(model_name)
    except Exception as exc:
        print(json.dumps({"ready": False, "error": f"model load failed: {exc}"}), flush=True)
        sys.exit(1)

    # Signal Node.js: model loaded, ready to accept tasks
    print(json.dumps({"ready": True, "model": model_name}), flush=True)

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            task        = json.loads(line)
            in_bytes    = base64.b64decode(task["data"])
            # remove() returns RGBA PNG with transparent background
            out_bytes   = remove(in_bytes, session=session)
            out_b64     = base64.b64encode(out_bytes).decode("utf-8")
            print(json.dumps({"ok": True, "data": out_b64}), flush=True)
        except Exception:
            err = traceback.format_exc(limit=3)
            print(json.dumps({"ok": False, "error": err}), flush=True)

if __name__ == "__main__":
    main()
