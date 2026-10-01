const configuredBackendUrl = import.meta.env.VITE_API_BASE_URL;

// Production REST calls stay on the frontend origin and are proxied by Vercel.
export const apiBaseUrl = import.meta.env.PROD ? "" : configuredBackendUrl;
export const socketUrl = import.meta.env.VITE_SOCKET_URL || configuredBackendUrl;
