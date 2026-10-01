import { ref, computed, onUnmounted } from "vue";
import { useQuery } from "@tanstack/vue-query";
import apiFetch from "../utils/api";
import { useSocket } from "./useSocket.js";
import { apiBaseUrl } from "../config/urls.js";

const apiUrl = apiBaseUrl;

// exchange: a ref/computed holding one of 'binance' | 'bybit' | 'bitunix'
export function useExchangeSymbols(exchange) {
	return useQuery({
		queryKey: ["market-symbols", exchange],
		queryFn: async () => {
			const response = await apiFetch(`${apiUrl}/api/market/${exchange.value}/symbols`, {
				method: "GET",
				credentials: "include",
			});
			return response;
		},
		enabled: computed(() => !!exchange.value),
		staleTime: 30 * 60 * 1000,
	});
}

// Streams live ticker prices over the shared socket. One active subscription at a time;
// calling subscribe() again swaps the pair, unsubscribe() (or unmount) tears it down.
export function useLivePrice() {
	const { socket } = useSocket();
	const price = ref(null);
	let current = null;

	const handleUpdate = (payload) => {
		if (current && payload.exchange === current.exchange && payload.symbol === current.symbol) {
			price.value = payload.price;
		}
	};

	socket.on("price-update", handleUpdate);

	const subscribe = (exchange, symbol) => {
		if (current && current.exchange === exchange && current.symbol === symbol) return;
		price.value = null;
		current = { exchange, symbol };
		socket.emit("subscribe-price", { exchange, symbol });
	};

	const unsubscribe = () => {
		if (!current) return;
		current = null;
		price.value = null;
		socket.emit("unsubscribe-price");
	};

	onUnmounted(() => {
		socket.off("price-update", handleUpdate);
		unsubscribe();
	});

	return { price, subscribe, unsubscribe };
}
