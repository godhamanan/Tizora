import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Path to the Python worker relative to compiled output (dist/lib → workers/)
const WORKER_PATH = path.resolve(__dirname, '../../workers/bgremoval.py');
const REMBG_TIMEOUT_MS = 35_000;  // 35s per image — generous for large images on CPU

type Pending = {
  resolve: (data: string) => void;
  reject:  (err: Error)   => void;
};

class BgRemovalWorker {
  private proc:          ChildProcess | null = null;
  private pending:       Pending[]           = [];
  private _ready         = false;
  private _starting      = false;
  private _readyWaiters: Array<() => void>   = [];

  // Start the Python worker process and load the rembg model.
  // Safe to call multiple times — returns immediately if already running.
  async start(): Promise<void> {
    if (this._ready)    return;
    if (this._starting) {
      // Another start() already in-flight — attach to the same waiter list
      return new Promise<void>(res => this._readyWaiters.push(res));
    }
    this._starting = true;

    const pythonBin = process.env.PYTHON_BIN ?? '/opt/venv/bin/python3';

    let proc: ChildProcess;
    try {
      proc = spawn(pythonBin, [WORKER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env:   { ...process.env },
      });
    } catch (err) {
      this._starting = false;
      console.warn('⚠️  rembg worker could not start (Python not available):', err);
      this._readyWaiters.forEach(fn => fn());  // unblock waiters; they'll use fallback
      this._readyWaiters = [];
      return;
    }

    this.proc = proc;

    const rl = createInterface({ input: proc.stdout! });

    rl.on('line', (line: string) => {
      if (!line.trim()) return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(line) as Record<string, unknown>; } catch { return; }

      // First line is the ready handshake — not a task response
      if ('ready' in msg) {
        this._starting = false;
        if (msg['ready'] === true) {
          this._ready = true;
          console.log(`✅ rembg worker ready  model=${msg['model'] ?? '?'}`);
        } else {
          console.error('❌ rembg worker failed to load model:', msg['error']);
        }
        this._readyWaiters.forEach(fn => fn());
        this._readyWaiters = [];
        return;
      }

      // Normal task response
      const cb = this.pending.shift();
      if (!cb) return;
      if (msg['ok'] === true) {
        cb.resolve(msg['data'] as string);
      } else {
        cb.reject(new Error((msg['error'] as string) ?? 'rembg returned ok:false'));
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.error('[rembg stderr]', text.slice(0, 300));
    });

    proc.on('exit', (code: number | null) => {
      this._ready    = false;
      this._starting = false;
      // Reject all in-flight tasks
      const drained = this.pending.splice(0);
      drained.forEach(cb => cb.reject(new Error('rembg worker exited')));
      console.warn(`⚠️  rembg worker exited (code ${code}) — will restart in 5s`);
      // Auto-restart so subsequent uploads work
      setTimeout(() => this.start().catch(console.error), 5_000);
    });

    // Return a promise that resolves once the ready handshake arrives
    return new Promise<void>(res => this._readyWaiters.push(res));
  }

  isReady(): boolean { return this._ready; }

  // Remove background from a JPEG/PNG supplied as base64.
  // Returns an RGBA PNG as base64. Throws if worker unavailable or rembg fails.
  async remove(imageBase64: string): Promise<string> {
    if (!this._ready || !this.proc) {
      throw new Error('rembg worker not ready');
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('rembg timeout')), REMBG_TIMEOUT_MS)
    );

    const removePromise = new Promise<string>((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.proc!.stdin!.write(JSON.stringify({ data: imageBase64 }) + '\n');
    });

    return Promise.race([removePromise, timeoutPromise]);
  }
}

// Singleton — one persistent Python process for the lifetime of the Node server
export const bgWorker = new BgRemovalWorker();
