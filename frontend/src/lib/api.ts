import { API_URL } from './config';
import type { ApiErrorBody, User } from './types';

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;
  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.message ?? fallback);
    this.status = status;
    this.body = body;
  }

  fieldMessage(field: string) {
    const details = this.body?.details;
    if (!Array.isArray(details)) {
      return undefined;
    }
    for (const item of details) {
      if (typeof item === 'string' && item.toLowerCase().includes(field.toLowerCase())) {
        return item;
      }
      if (typeof item === 'object' && item && item.field === field) {
        return item.message;
      }
    }
    return undefined;
  }
}

async function parseBody(res: Response) {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function refreshSession(): Promise<{
  accessToken: string;
  user: User;
} | null> {
  const run = async () => {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      accessToken = null;
      return null;
    }
    const data = (await res.json()) as { accessToken: string; user: User };
    accessToken = data.accessToken;
    return data;
  };

  if (!refreshInFlight) {
    refreshInFlight = run()
      .then((data) => data?.accessToken ?? null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  const token = await refreshInFlight;
  if (!token) {
    return null;
  }
  const me = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  if (!me.ok) {
    return null;
  }
  const user = (await me.json()) as User;
  return { accessToken: token, user };
}

type RequestOptions = {
  method?: string;
  json?: unknown;
  token?: string | null;
  retry?: boolean;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const token = options.token === undefined ? accessToken : options.token;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
  });

  if (res.status === 401 && options.retry !== false && !path.startsWith('/auth/')) {
    if (!refreshInFlight) {
      refreshInFlight = refreshSession()
        .then((data) => data?.accessToken ?? null)
        .finally(() => {
          refreshInFlight = null;
        });
    }
    const nextToken = await refreshInFlight;
    if (nextToken) {
      return api<T>(path, { ...options, retry: false });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('booknest:logout'));
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body && typeof body === 'object' ? (body as ApiErrorBody) : null,
      res.statusText,
    );
  }
  return body as T;
}

export function authApi() {
  return {
    signup: (data: { name: string; email: string; password: string }) =>
      api<{ accessToken: string; user: User }>('/auth/signup', {
        method: 'POST',
        json: data,
        retry: false,
      }),
    login: (data: { email: string; password: string }) =>
      api<{ accessToken: string; user: User }>('/auth/login', {
        method: 'POST',
        json: data,
        retry: false,
      }),
    logout: () =>
      api<{ success: boolean }>('/auth/logout', { method: 'POST', retry: false }),
  };
}
