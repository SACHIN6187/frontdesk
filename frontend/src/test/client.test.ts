import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildWsUrl } from '../api/client';

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  } as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('attaches the Bearer header on authenticated requests', async () => {
    const fetchMock = mockFetchOnce([]);
    await api.listTickets('tok-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-123');
  });

  it('sends a JSON body with content-type for POST', async () => {
    const fetchMock = mockFetchOnce(
      { access_token: 'a', org_id: 'o', role: 'owner' },
      { status: 201 },
    );
    await api.signup({
      org_name: 'Acme',
      name: 'Sam',
      email: 's@a.com',
      password: 'pw',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/auth/signup');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({ org_name: 'Acme' });
  });

  it('throws an ApiError carrying the HTTP status on failure', async () => {
    mockFetchOnce({ detail: 'Seat limit reached' }, { status: 402 });
    await expect(
      api.inviteMember('tok', {
        email: 'x@y.com',
        name: 'X',
        password: 'pw',
        role: 'agent',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 402,
      detail: 'Seat limit reached',
    });
  });

  it('does not attach Authorization when no token is passed', async () => {
    const fetchMock = mockFetchOnce({ access_token: 'a', org_id: 'o', role: 'owner' });
    await api.login({ email: 'a@b.com', password: 'pw' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('builds a ws:// url with the token for an http api base', () => {
    const url = buildWsUrl('abc 123');
    expect(url.startsWith('ws://')).toBe(true);
    expect(url).toContain('/ws?token=abc%20123');
  });

  it('ApiError is an instance of Error', () => {
    const e = new ApiError(403, 'Forbidden');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(403);
  });
});
