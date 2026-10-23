export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers }, cache: 'no-store' });
  } catch { throw new ApiError(0, 'No se pudo conectar con el servidor'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || 'No se pudo completar la operación');
  return data as T;
}
export const dateTime = (value: string) => new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const dateShort = (value: string) => new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(value));
