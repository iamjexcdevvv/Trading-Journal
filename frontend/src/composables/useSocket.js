import { io } from "socket.io-client";
import { watch } from "vue";
import { useAuth } from "./useAuth.js";

const socket = io(import.meta.env.VITE_API_BASE_URL, { autoConnect: false });
let authenticationInitialized = false;

export function useSocket() {
    if (!authenticationInitialized) {
        authenticationInitialized = true;
        const { token } = useAuth();

        socket.on('connect_error', (error) => {
            if (error.message === 'Authentication failed') socket.disconnect();
        });

        watch(token, (newToken) => {
            socket.auth = newToken ? { token: newToken } : {};
            if (socket.connected) socket.disconnect();
            if (newToken) socket.connect();
        }, { immediate: true });
    }

    return { socket };
}
