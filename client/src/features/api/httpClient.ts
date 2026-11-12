import axios, { type AxiosInstance } from 'axios'

export const API_TOKEN_STORAGE_KEY = 'smarthr.api.token.v1'
export const API_SESSION_EXPIRES_KEY = 'smarthr.api.expiresAt.v1'

export function getConfiguredApiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!raw || raw.trim().length === 0) {
    return null
  }
  return raw.trim().replace(/\/+$/, '')
}

export function isBackendApiConfigured(): boolean {
  return getConfiguredApiBaseUrl() !== null
}

export interface ApiErrorPayload {
  code?: string
  message?: string
  errors?: Record<string, string[]>
}

export class ApiClientError extends Error {
  readonly code: string
  readonly httpStatus: number
  readonly fieldErrors?: Record<string, string>

  constructor(
    code: string,
    message: string,
    httpStatus: number,
    fieldErrors?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.httpStatus = httpStatus
    this.fieldErrors = fieldErrors
  }
}

export function readStoredApiToken(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null
  }
  return window.sessionStorage.getItem(API_TOKEN_STORAGE_KEY)
}

export function writeStoredApiSession(
  token: string,
  expiresAtUtc: string,
): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return
  }
  window.sessionStorage.setItem(API_TOKEN_STORAGE_KEY, token)
  window.sessionStorage.setItem(API_SESSION_EXPIRES_KEY, expiresAtUtc)
}

export function clearStoredApiSession(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return
  }
  window.sessionStorage.removeItem(API_TOKEN_STORAGE_KEY)
  window.sessionStorage.removeItem(API_SESSION_EXPIRES_KEY)
}

export function normalizeAxiosError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) {
    return error
  }
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    const status = error.response?.status ?? 500
    const data = error.response?.data
    const fieldErrors: Record<string, string> = {}
    if (data?.errors && typeof data.errors === 'object') {
      for (const [k, msgs] of Object.entries(data.errors)) {
        if (Array.isArray(msgs) && msgs.length > 0) {
          fieldErrors[k] = String(msgs[0])
        }
      }
    }
    const firstFieldMsg = Object.values(fieldErrors)[0]
    const message =
      data?.message ||
      firstFieldMsg ||
      (status === 0
        ? 'Unable to connect to the Smart HR Payroll API server.'
        : error.message || 'API request failed.')

    return new ApiClientError(
      data?.code ?? (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'API_ERROR'),
      message,
      status,
      Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    )
  }

  return new ApiClientError(
    'API_ERROR',
    error instanceof Error ? error.message : 'Unexpected API error.',
    500,
  )
}

export function createApiHttpClient(baseUrl?: string): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl ?? getConfiguredApiBaseUrl() ?? 'http://127.0.0.1:8000/api',
    withCredentials: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })

  client.interceptors.request.use((config) => {
    const token = readStoredApiToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => Promise.reject(normalizeAxiosError(error)),
  )

  return client
}

