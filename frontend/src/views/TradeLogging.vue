<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, X } from "lucide-vue-next";
import TradesList from "../components/TradesList.vue";
import AddTradeModal from "../components/AddTradeModal.vue";
import { useTrades, AVAILABLE_TAGS } from "../composables/useTrades.js";
import { useAuth } from "../composables/useAuth.js";

const { isLoggedIn } = useAuth();

const route = useRoute();
const router = useRouter();

const { trades, addTrade, removeTrade } = useTrades();
const lastAddedId = ref(null);
const isModalOpen = ref(route.query.autoOpen === "true");
const selectedFilterTags = ref([]);

const apiUrl = import.meta.env.VITE_API_BASE_URL;

const filteredTrades = computed(() => {
	if (selectedFilterTags.value.length === 0) return trades.value;
	return trades.value.filter((trade) => 
		trade.tags?.some(tag => selectedFilterTags.value.includes(tag))
	);
});

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

onMounted(async () => {
	if (isLoggedIn.value) {
		try {
			const response = await fetch(`${apiUrl}/api/trades`);

			if (response.ok) {
				const trades = await response.json();

				trades.forEach((trade) => addTrade(trade));
			} else {
				console.error("Failed to fetch trades:", response.statusText);
			}
		} catch (error) {
			console.error("Error fetching trades:", error);
		}
	}

    console.log("TradeLogging mounted");
});
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
					{{ filteredTrades.length }} {{ filteredTrades.length === 1 ? "entry" : "entries" }}
				</span>
			</div>
			<div class="flex items-center gap-2">
				<!-- Tag Filters -->
				<div v-if="selectedFilterTags.length > 0" class="flex items-center gap-2 overflow-x-auto scrollbar-thin max-w-52 lg:max-w-88">
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
		<div class="lg:ml-34 px-6 py-3 border-b border-border bg-surface/40 flex items-center gap-2 overflow-x-auto">
			<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase shrink-0">
				Filter by tag:
			</span>
			<button
				v-for="tag in AVAILABLE_TAGS"
				:key="tag"
				@click="toggleFilterTag(tag)"
				:class="[
					'px-2.5 py-1 border font-mono text-[10px] tracking-wider uppercase transition-colors shrink-0',
					selectedFilterTags.includes(tag)
						? 'border-primary text-primary bg-primary/10'
						: 'border-border text-text-muted hover:text-text-main hover:border-primary/50'
				]"
			>
				{{ tag }}
			</button>
		</div>

		<!-- Ledger -->
		<section class="flex-1 grid-bg min-h-[66vh] overflow-hidden" data-testid="ledger-area">
			<TradesList :trades="filteredTrades" :last-added-id="lastAddedId" @delete="handleRemoveTrade" />
		</section>

		<!-- Add Trade Modal -->
		<AddTradeModal :is-open="isModalOpen" @close="closeModal" @submit="handleAdd" />
	</div>
</template>
