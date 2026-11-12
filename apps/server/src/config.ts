import { DEFAULT_SERVER_PORT } from '@the-world/shared';

/** Reads the listen port from the environment, falling back to the shared default. */
export function resolvePort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_SERVER_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${value}": expected an integer between 1 and 65535`);
  }
  return port;
}
