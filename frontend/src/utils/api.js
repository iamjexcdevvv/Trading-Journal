import { useAuth } from "@/composables/useAuth"

const { token, setToken } = useAuth();
const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const refreshToken = async () => {
    try {
        const res = await fetch(`${apiUrl}/api/auth/refresh`, {
            method: "POST",
            credentials: "include",
        });

        if (!res.ok) return false;

        const { accessToken } = await res.json();
        setToken(accessToken);
    }
    catch (error) {
        console.error("Token refresh failed:", error);
        return false;
    }

    return true;
}

const apiFetch = async (url, options = {}, retry = true) => {
  const response = await fetch(`${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token.value}` }), // attach token
      ...options.headers,
    },
  })

  // Token expired or invalid — refresh and retry
  if (response.status === 401 && retry) {
    const isRefreshed = await refreshToken();

    if (isRefreshed) {
      return apiFetch(url, options, false);
    }

    setToken(null);
    window.location.href = '/login'
  }

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export default apiFetch