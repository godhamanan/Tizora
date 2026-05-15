import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  project:     process.env.TRIGGER_PROJECT_REF!,
  dirs:        ['./src/trigger'],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 30000, factor: 2 },
  },
});
