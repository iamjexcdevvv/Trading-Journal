import { ref, computed } from "vue";

// In-memory store (resets on refresh) per user choice.
const trades = ref([]);

export function useTrades() {
    const addTrade = (trade) => {
        trades.value.unshift({
            id: crypto.randomUUID(),
            createdAt: trade.date || new Date(),
            ...trade,
        });
    };

    const removeTrade = (id) => {
        trades.value = trades.value.filter((t) => t.id !== id);
    };

    const stats = computed(() => {
        const total = trades.value.length;
        const longs = trades.value.filter((t) => t.direction === "Long").length;
        const shorts = trades.value.filter((t) => t.direction === "Short").length;
        return { total, longs, shorts };
    });

    return { trades, addTrade, removeTrade, stats };
}

export const STRATEGIES = {
    Long: ["Trendline Breakout", "Bounce Play", "Tabo Play"],
    Short: ["Trendline Breakdown", "Correction Play", "Tabo Play"],
};
