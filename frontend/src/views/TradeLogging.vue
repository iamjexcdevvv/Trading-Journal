<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus } from "lucide-vue-next";
import TradesList from "../components/TradesList.vue";
import AddTradeModal from "../components/AddTradeModal.vue";
import { useTrades } from "../composables/useTrades.js";

const route = useRoute();
const router = useRouter();

const { trades, addTrade, removeTrade } = useTrades();
const lastAddedId = ref(null);
const isModalOpen = ref(route.query.autoOpen === "true");

const apiUrl = import.meta.env.VITE_API_BASE_URL;

const handleAdd = (payload) => {
	addTrade(payload);
	lastAddedId.value = trades.value[0]?.id;
	isModalOpen.value = false;
	router.replace({ query: {} }); // Clear query params from URL
};

const handleRemoveTrade = async (id, _id) => {
	const response = await fetch(`${apiUrl}/api/trades/${_id}`, {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
	});

	if (!response.ok) {
		console.error(`Failed to delete trade with id ${_id}:`, response.statusText);
		return;
	}

	removeTrade(id);
};

const openModal = () => {
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	router.replace({ query: {} }); // Clear query params from URL
};
</script>

<template>
	<div class="h-full flex flex-col min-h-0">
		<!-- Header with Add Trade Button -->
		<div
			class="lg:ml-34 px-6 h-12 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur"
		>
			<div class="flex items-center gap-3">
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Trade Logging
				</span>
				<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
					{{ trades.length }} {{ trades.length === 1 ? "entry" : "entries" }}
				</span>
			</div>
			<button
				@click="openModal"
				class="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-heading font-bold text-sm tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
				data-testid="add-trade-btn"
			>
				<Plus :size="16" :stroke-width="2.5" />
				Add Trade
			</button>
		</div>

		<!-- Ledger -->
		<section class="flex-1 grid-bg min-h-[60vh]" data-testid="ledger-area">
			<TradesList :trades="trades" :last-added-id="lastAddedId" @delete="handleRemoveTrade" />
		</section>

		<!-- Add Trade Modal -->
		<AddTradeModal :is-open="isModalOpen" @close="closeModal" @submit="handleAdd" />
	</div>
</template>
