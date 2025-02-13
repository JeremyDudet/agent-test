import useStore from '../store/useStore';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
  }

  private getHeaders(token: string | null) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  async get<T>(path: string, token: string | null): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(token),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'An error occurred');
    }

    return response.json();
  }

  async post<T>(path: string, data: any, token: string | null): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'An error occurred');
    }

    return response.json();
  }

  async put<T>(path: string, data: any, token: string | null): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(token),
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'An error occurred');
    }

    return response.json();
  }

  async delete(path: string, token: string | null): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(token),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'An error occurred');
    }
  }
}

export const api = new ApiClient(); 