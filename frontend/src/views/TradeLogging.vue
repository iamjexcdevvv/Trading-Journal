<script setup>
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, X } from "lucide-vue-next";
import TradesList from "../components/TradesList.vue";
import AddTradeModal from "../components/AddTradeModal.vue";
import EditTradeModal from "../components/EditTradeModal.vue";
import Loading from "../components/Loading.vue";
import { useTrades } from "../composables/useTrades.js";
import { useAuth } from "../composables/useAuth.js";
import { useTags } from "../composables/useTags.js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import  apiFetch  from "../utils/api.js";

const { isLoggedIn, token } = useAuth();
const queryClient = useQueryClient();
const route = useRoute();
const router = useRouter();

const { trades, addTrade, removeTrade, setTrades } = useTrades();
const { tagNames } = useTags();
const lastAddedId = ref(null);
const isModalOpen = ref(route.query.autoOpen === "true");
const selectedFilterTags = ref([]);

const apiUrl = import.meta.env.VITE_API_BASE_URL;

const filteredTrades = computed(() => {
	if (selectedFilterTags.value.length === 0) return trades.value;
	return trades.value.filter((trade) =>
		trade.tags?.some((tag) => selectedFilterTags.value.includes(tag)),
	);
});

const handleAdd = (payload) => {
	addTradeMutation.mutate(payload);
};

const handleRemoveTrade = async (id, _id) => {
	deleteTradeMutation.mutate(_id);
};

const isEditModalOpen = ref(false);
const editingTrade = ref(null);

const handleEditTrade = (trade) => {
	editingTrade.value = trade;
	isEditModalOpen.value = true;
};

const handleUpdate = ({ _id, payload }) => {
	updateTradeMutation.mutate({ _id, payload });
};

const closeEditModal = () => {
	isEditModalOpen.value = false;
	editingTrade.value = null;
};

const openModal = () => {
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	router.replace({ query: {} }); // Clear query params from URL
};

const clearFilter = () => {
	selectedFilterTags.value = [];
};

const toggleFilterTag = (tag) => {
	const index = selectedFilterTags.value.indexOf(tag);
	if (index === -1) {
		selectedFilterTags.value.push(tag);
	} else {
		selectedFilterTags.value.splice(index, 1);
	}
};

const removeFilterTag = (tag) => {
	const index = selectedFilterTags.value.indexOf(tag);
	if (index !== -1) {
		selectedFilterTags.value.splice(index, 1);
	}
};

const deleteTradeMutation = useMutation({
	mutationFn: async (_id) => {
		const response = await apiFetch(`${apiUrl}/api/trades/${_id}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		});

		return _id;
	},
	onSuccess: (deletedId) => {
		// Find the local id corresponding to the _id
		const tradeToDelete = trades.value.find((t) => t._id === deletedId);
		if (tradeToDelete) {
			removeTrade(tradeToDelete.id);
		}
		queryClient.invalidateQueries(["trades"]);
	},
});

const addTradeMutation = useMutation({
	mutationFn: async (payload) => {
		const response = await apiFetch(`${apiUrl}/api/trades`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(payload),
		});

		return response;
	},
	onSuccess: (data) => {
		addTrade(data);
		lastAddedId.value = trades.value[0]?.id;
		isModalOpen.value = false;
		router.replace({ query: {} });
		queryClient.invalidateQueries(["trades"]);
	},
});

const updateTradeMutation = useMutation({
	mutationFn: async ({ _id, payload }) => {
		const response = await apiFetch(`${apiUrl}/api/trades/${_id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(payload),
		});

		return response;
	},
	onSuccess: () => {
		isEditModalOpen.value = false;
		editingTrade.value = null;
		queryClient.invalidateQueries(["trades"]);
	},
});

const fetchTrades = async () => {
	const response = await apiFetch(`${apiUrl}/api/trades`, {
		method: "GET",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
		},
	});

	return response;
};

const {
	data: cachedTrades,
	isLoading,
	isError,
} = useQuery({
	queryKey: ["trades"],
	queryFn: fetchTrades,
	staleTime: 5 * 60 * 1000,
	enabled: isLoggedIn.value,
	refetchOnWindowFocus: true,
	refetchOnReconnect: true,
});

// Sync cached data with local trades state
watch(
	cachedTrades,
	(newTrades) => {
		if (newTrades) {
			setTrades(newTrades);
		}
	},
	{ immediate: true },
);
</script>

<template>
	<div class="h-full flex flex-col min-h-0">
		<!-- Header with Add Trade Button -->
		<div
			class="px-6 h-12 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur"
		>
			<div class="flex items-center gap-3">
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Trade Logging
				</span>
				<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
					{{ filteredTrades.length }}
					{{ filteredTrades.length === 1 ? "entry" : "entries" }}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<!-- Tag Filters -->
				<div
					v-if="selectedFilterTags.length > 0"
					class="flex items-center gap-2 overflow-x-auto scrollbar-thin max-w-52 lg:max-w-88"
				>
					<div
						v-for="tag in selectedFilterTags"
						:key="tag"
						class="flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs font-mono tracking-wider uppercase rounded border border-primary/30 shrink-0"
					>
						<span>{{ tag }}</span>
						<button @click="removeFilterTag(tag)" class="hover:text-primary-foreground">
							<X :size="10" :stroke-width="2.5" />
						</button>
					</div>
					<button
						@click="clearFilter"
						class="flex items-center gap-1 px-2 py-1 bg-danger/20 text-danger text-xs font-mono tracking-wider uppercase rounded border border-danger/30 hover:bg-danger/30 shrink-0"
					>
						Clear All
					</button>
				</div>
				<button
					@click="openModal"
					class="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-heading font-bold text-sm tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all shrink-0"
					data-testid="add-trade-btn"
				>
					<Plus :size="16" :stroke-width="2.5" />
					Add Trade
				</button>
			</div>
		</div>

		<!-- Tag Filter Bar -->
		<div
			class="px-6 py-3 border-b border-border bg-surface/40 flex items-center gap-2 overflow-x-auto"
		>
			<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase shrink-0">
				Filter by tag:
			</span>
			<button
				v-for="tag in tagNames"
				:key="tag"
				@click="toggleFilterTag(tag)"
				:class="[
					'px-2.5 py-1 border font-mono text-[10px] tracking-wider uppercase transition-colors shrink-0',
					selectedFilterTags.includes(tag)
						? 'border-primary text-primary bg-primary/10'
						: 'border-border text-text-muted hover:text-text-main hover:border-primary/50',
				]"
			>
				{{ tag }}
			</button>
		</div>

		<!-- Ledger -->
		<section class="flex-1 grid-bg min-h-[66vh] overflow-hidden relative" data-testid="ledger-area">
			<!-- Loading Overlay -->
			<div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
				<Loading message="Loading trades..." />
			</div>
			
			<TradesList
				:trades="filteredTrades"
				:last-added-id="lastAddedId"
				@delete="handleRemoveTrade"
				@edit="handleEditTrade"
			/>
		</section>

		<!-- Add Trade Modal -->
		<AddTradeModal :is-open="isModalOpen" @close="closeModal" @submit="handleAdd" />

		<!-- Edit Trade Modal -->
		<EditTradeModal :is-open="isEditModalOpen" :trade="editingTrade" @close="closeEditModal" @submit="handleUpdate" />
	</div>
</template>
