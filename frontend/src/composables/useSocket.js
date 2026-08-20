import { io } from "socket.io-client";
import { watch } from "vue";
import { useAuth } from "./useAuth.js";

const socket = io(import.meta.env.VITE_API_BASE_URL || "http://localhost:3000");

export function useSocket() {
    const { token } = useAuth();
    
    const authenticate = () => {
        if (token.value) {
            socket.emit('authenticate', { token: token.value });
            console.log("Socket: Sent authentication token");
        }
    };

    socket.on('connect', () => {
        authenticate();
    });

    watch(token, (newToken) => {
        if (newToken) {
            authenticate();
        }
    }, { immediate: true });

    return { socket };
}