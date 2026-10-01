<script setup>
import { ref, computed } from "vue";
import { Plus, Trash2, X, Link2, RefreshCw } from "lucide-vue-next";
import { useExchangeConnections } from "../composables/useExchangeConnections.js";
import Loading from "./Loading.vue";

const {
	connections,
	createConnection,
	createConnectionError,
	deleteConnectionAsync,
	syncNowAsync,
	isLoading,
	isCreatingConnection,
	syncError,
} = useExchangeConnections();

const EXCHANGES = [
	{ id: "binance", label: "Binance", requiresPassphrase: false },
	{ id: "okx", label: "OKX", requiresPassphrase: true },
	{ id: "bitunix", label: "Bitunix", requiresPassphrase: false },
];

const isModalOpen = ref(false);
const newExchange = ref("binance");
const newLabel = ref("");
const newApiKey = ref("");
const newApiSecret = ref("");
const newPassphrase = ref("");
const syncingId = ref(null);

const selectedExchange = computed(() => EXCHANGES.find((e) => e.id === newExchange.value));

const isFormValid = computed(() => {
	if (!newLabel.value.trim() || !newApiKey.value.trim() || !newApiSecret.value.trim()) return false;
	if (selectedExchange.value?.requiresPassphrase && !newPassphrase.value.trim()) return false;
	return true;
});

const resetForm = () => {
	newExchange.value = "binance";
	newLabel.value = "";
	newApiKey.value = "";
	newApiSecret.value = "";
	newPassphrase.value = "";
};

const openModal = () => {
	resetForm();
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	resetForm();
};

const handleSubmit = () => {
	if (!isFormValid.value) return;

	const connectionData = {
		exchange: newExchange.value,
		label: newLabel.value.trim(),
		apiKey: newApiKey.value.trim(),
		apiSecret: newApiSecret.value.trim(),
	};

	if (selectedExchange.value?.requiresPassphrase) {
		connectionData.passphrase = newPassphrase.value.trim();
	}

	createConnection(connectionData, {
		onSuccess: () => closeModal(),
	});
};

const handleDelete = async (id) => {
	if (confirm("Remove this exchange connection? Synced trades already in your journal are kept.")) {
		await deleteConnectionAsync(id);
	}
};

const handleSyncNow = async (id) => {
	syncingId.value = id;
	try {
		await syncNowAsync(id);
	} finally {
		syncingId.value = null;
	}
};

const exchangeLabel = (id) => EXCHANGES.find((e) => e.id === id)?.label || id;

const formatDate = (dateString) => {
	if (!dateString) return "Never";
	const date = new Date(dateString);
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};
</script>

<template>
	<div class="border border-border bg-surface/40 p-4 relative">
		<!-- Loading Overlay -->
		<div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-surface/40 z-10">
			<Loading message="Loading connections..." />
		</div>

		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<Link2 :size="16" :stroke-width="2" class="text-text-muted" />
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Exchange Connections
				</span>
			</div>
			<button
				@click="openModal"
				class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-heading font-bold text-xs tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
			>
				<Plus :size="12" :stroke-width="2.5" />
				Connect Exchange
			</button>
		</div>

		<p class="font-mono text-[10px] text-text-muted/70 mb-4 leading-relaxed">
			Open and closed futures trades sync into your journal automatically. Only connect a
			read-only, no-trade, no-withdraw API key. OKX permissions are checked automatically.
		</p>

		<div v-if="!connections || connections.length === 0" class="text-text-muted/40 font-mono text-xs">
			No exchanges connected
		</div>
		<p v-if="syncError" class="font-mono text-xs text-danger mb-2">
			{{ syncError.message }}
		</p>
		<div v-else class="space-y-2">
			<div
				v-for="connection in connections"
				:key="connection._id"
				class="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2.5 bg-surface/30 border border-border rounded gap-2 transition-all"
			>
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
					<span class="font-sans text-sm font-bold text-text-main">{{ connection.label }}</span>

					<span class="px-1.5 py-0.5 text-[10px] font-heading font-bold uppercase tracking-wider rounded bg-primary/10 text-primary border border-primary/20">
						{{ exchangeLabel(connection.exchange) }}
					</span>

					<span
						:class="[
							'px-1.5 py-0.5 text-[10px] font-heading font-bold uppercase tracking-wider rounded border',
							connection.status === 'connected'
								? 'bg-success/10 text-success border-success/20'
								: connection.status === 'error'
								? 'bg-danger/10 text-danger border-danger/20'
								: 'bg-text-muted/10 text-text-muted border-text-muted/20'
						]"
						:title="connection.lastError || ''"
					>
						{{ connection.status }}
					</span>

					<span class="font-mono text-xs text-text-muted">
						Last synced: {{ formatDate(connection.lastSyncedAt) }}
					</span>
				</div>
				<div class="flex items-center gap-1 self-end sm:self-auto">
					<button
						@click="handleSyncNow(connection._id)"
						:disabled="syncingId === connection._id"
						class="p-1 text-text-muted hover:text-primary transition-colors disabled:opacity-40"
						title="Sync now"
					>
						<RefreshCw :size="12" :stroke-width="2" :class="{ 'animate-spin': syncingId === connection._id }" />
					</button>
					<button
						@click="handleDelete(connection._id)"
						class="p-1 text-text-muted hover:text-danger transition-colors"
						title="Remove"
					>
						<Trash2 :size="12" :stroke-width="2" />
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Modal -->
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
				<div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeModal"></div>
				<div class="relative w-full max-w-md bg-background border border-border rounded-lg shadow-2xl p-6">
					<div class="flex items-center justify-between mb-4">
						<h3 class="font-heading font-black text-lg tracking-tight uppercase">
							Connect Exchange
						</h3>
						<button @click="closeModal" class="p-2 text-text-muted hover:text-text-main transition-colors">
							<X :size="20" :stroke-width="2" />
						</button>
					</div>

					<form @submit.prevent="handleSubmit" class="space-y-4">
						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Exchange
							</label>
							<div class="grid grid-cols-3 gap-2">
								<button
									v-for="ex in EXCHANGES"
									:key="ex.id"
									type="button"
									@click="newExchange = ex.id"
									:class="[
										'py-2 text-[10px] font-heading font-bold tracking-widest uppercase border transition-all duration-150',
										newExchange === ex.id
											? 'border-primary bg-primary/10 text-primary'
											: 'border-border text-text-muted hover:border-text-muted/50 hover:text-text-main'
									]"
								>
									{{ ex.label }}
								</button>
							</div>
						</div>

						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Label
							</label>
							<input
								v-model="newLabel"
								type="text"
								placeholder="e.g. Main Binance"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								API Key
							</label>
							<input
							v-model="newApiKey"
							type="password"
							autocomplete="new-password"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								API Secret
							</label>
							<input
								v-model="newApiSecret"
								type="password"
								autocomplete="new-password"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<div v-if="selectedExchange?.requiresPassphrase">
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Passphrase
							</label>
							<input
								v-model="newPassphrase"
								type="password"
								autocomplete="new-password"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-mono text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<p v-if="createConnectionError" class="font-mono text-xs text-danger">
							{{ createConnectionError.message }}
						</p>

						<button
							type="submit"
							:disabled="!isFormValid || isCreatingConnection"
							:class="[
								'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
								isFormValid && !isCreatingConnection
									? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
									: 'bg-border text-text-muted cursor-not-allowed',
							]"
						>
							{{ isCreatingConnection ? "Connecting..." : "Connect" }}
						</button>
					</form>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
	transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
	opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
	transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
	transform: scale(0.95);
	opacity: 0;
}
</style>
