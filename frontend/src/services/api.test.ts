import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveApiBaseUrl,
  verifyPin,
  getStoredToken,
  setStoredToken,
  fetchDashboardOverview,
} from './api';

describe('Telemetry Dashboard API Client', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.restoreAllMocks();
  });

  it('debe resolver el origen actual en producción cuando VITE_API_URL está vacío', () => {
    expect(resolveApiBaseUrl('', 'https://panel.cabrerizolab.net/', false)).toBe(
      'https://panel.cabrerizolab.net'
    );
  });

  it('debe verificar el PIN y almacenar el token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok-999' }),
    } as Response);

    const token = await verifyPin('3272');
    expect(token).toBe('tok-999');
    expect(getStoredToken()).toBe('tok-999');
  });

  it('debe limpiar el token cuando el backend devuelve 401', async () => {
    setStoredToken('old-tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    await expect(fetchDashboardOverview('old-tok')).rejects.toThrow('Error HTTP 401');
    expect(getStoredToken()).toBeNull();
  });
});
