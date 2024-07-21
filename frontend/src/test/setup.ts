import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25 ships an experimental global `localStorage` that is non-functional without
// the --localstorage-file flag, and it shadows jsdom's implementation. Install a real
// in-memory Storage on both globalThis and window so app code (which uses the bare
// `localStorage` global) and tests get a working store.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memory = new MemoryStorage();
for (const target of [globalThis, window] as const) {
  Object.defineProperty(target, 'localStorage', {
    value: memory,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
