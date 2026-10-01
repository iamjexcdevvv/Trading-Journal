import { useAuth } from "@/composables/useAuth"
import { apiBaseUrl } from "@/config/urls.js";

const { token, setToken } = useAuth();
const apiUrl = apiBaseUrl;
let refreshPromise = null;

export const refreshToken = async () => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });

        if (!res.ok) return false;

        const { accessToken } = await res.json();
        if (!accessToken) return false;
        setToken(accessToken);
      } catch (error) {
        console.error("Token refresh failed:", error);
        return false;
      }

      return true;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
};

const apiFetch = async (url, options = {}, retry = true) => {
  const response = await fetch(`${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token.value && { Authorization: `Bearer ${token.value}` }),
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
    // Router guard will handle redirect to login
  }

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export default apiFetch
