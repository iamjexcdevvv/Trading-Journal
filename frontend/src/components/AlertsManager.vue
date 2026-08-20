<script setup>
import { ref, computed } from "vue";
import { Plus, Trash2, X, Bell as BellIcon } from "lucide-vue-next";
import { useAlerts } from "../composables/useAlerts.js";
import Loading from "./Loading.vue";

const { alerts, createAlert, deleteAlertAsync, isLoading } = useAlerts();

const isModalOpen = ref(false);
const newSymbol = ref("");
const newType = ref("horizontal");
const newPrice = ref("");
const newCondition = ref("crossing up");
const newStartPrice = ref("");
const newStartTime = ref("");
const newEndPrice = ref("");
const newEndTime = ref("");

const conditions = ["crossing up", "crossing down", "crossing"];

const isFormValid = computed(() => {
	if (!newSymbol.value.trim()) return false;
	if (newType.value === "horizontal") {
		return !!newPrice.value;
	} else {
		return !!newStartPrice.value && !!newStartTime.value && !!newEndPrice.value && !!newEndTime.value;
	}
});

const sortedAlerts = computed(() => {
	if (!alerts.value) return [];
	return [...alerts.value].sort((a, b) => {
		const aActive = (a.status || 'active') === 'active';
		const bActive = (b.status || 'active') === 'active';
		if (aActive && !bActive) return -1;
		if (!aActive && bActive) return 1;
		return new Date(b.createdAt) - new Date(a.createdAt);
	});
});

const openModal = () => {
	newSymbol.value = "";
	newType.value = "horizontal";
	newPrice.value = "";
	newCondition.value = "crossing up";
	newStartPrice.value = "";
	newStartTime.value = "";
	newEndPrice.value = "";
	newEndTime.value = "";
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	newSymbol.value = "";
	newType.value = "horizontal";
	newPrice.value = "";
	newCondition.value = "crossing up";
	newStartPrice.value = "";
	newStartTime.value = "";
	newEndPrice.value = "";
	newEndTime.value = "";
};

const handleSubmit = () => {
	if (!isFormValid.value) return;

	const alertData = {
		symbol: newSymbol.value.trim().toUpperCase(),
		type: newType.value,
		condition: newCondition.value,
	};

	if (newType.value === "horizontal") {
		alertData.price = parseFloat(newPrice.value);
	} else {
		alertData.startPrice = parseFloat(newStartPrice.value);
		alertData.startTime = new Date(newStartTime.value).toISOString();
		alertData.endPrice = parseFloat(newEndPrice.value);
		alertData.endTime = new Date(newEndTime.value).toISOString();
	}

	createAlert(alertData);
	closeModal();
};

const handleDelete = async (id) => {
	if (confirm("Are you sure you want to delete this alert?")) {
		await deleteAlertAsync(id);
	}
};

const formatDate = (dateString) => {
	if (!dateString) return "";
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
			<Loading message="Loading alerts..." />
		</div>

		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<BellIcon :size="16" :stroke-width="2" class="text-text-muted" />
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Alerts
				</span>
			</div>
			<button
				@click="openModal"
				class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-heading font-bold text-xs tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
			>
				<Plus :size="12" :stroke-width="2.5" />
				Add Alert
			</button>
		</div>

		<div v-if="!sortedAlerts || sortedAlerts.length === 0" class="text-text-muted/40 font-mono text-xs">
			No alerts configured
		</div>
		<div v-else class="space-y-2">
			<div
				v-for="alert in sortedAlerts"
				:key="alert._id"
				:class="[
					'flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2.5 bg-surface/30 border border-border rounded gap-2 transition-all',
					(alert.status && alert.status !== 'active') ? 'opacity-50 border-dashed bg-surface/10' : ''
				]"
			>
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
					<span class="font-sans text-sm font-bold text-text-main">{{ alert.symbol }}</span>
					
					<span class="px-1.5 py-0.5 text-[10px] font-heading font-bold uppercase tracking-wider rounded bg-primary/10 text-primary border border-primary/20">
						{{ alert.type === 'trendline' ? 'Trendline' : 'Horizontal' }}
					</span>
					
					<span
						:class="[
							'px-1.5 py-0.5 text-[10px] font-heading font-bold uppercase tracking-wider rounded border',
							(!alert.status || alert.status === 'active')
								? 'bg-success/10 text-success border-success/20'
								: alert.status === 'triggered'
								? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
								: 'bg-text-muted/10 text-text-muted border-text-muted/20'
						]"
					>
						{{ alert.status || 'active' }}
					</span>

					<span class="font-mono text-xs text-text-muted">{{ alert.condition }}</span>
					
					<span v-if="alert.type !== 'trendline'" class="font-sans text-sm text-text-main font-semibold">
						${{ alert.price }}
					</span>
					<span v-else class="font-sans text-xs text-text-muted flex flex-wrap items-center gap-1.5">
						<span class="text-text-main font-semibold">${{ alert.startPrice }}</span>
						<span class="opacity-50 font-mono">({{ formatDate(alert.startTime) }})</span>
						<span class="opacity-50">&rarr;</span>
						<span class="text-text-main font-semibold">${{ alert.endPrice }}</span>
						<span class="opacity-50 font-mono">({{ formatDate(alert.endTime) }})</span>
					</span>
				</div>
				<div class="flex items-center self-end sm:self-auto">
					<button
						@click="handleDelete(alert._id)"
						class="p-1 text-text-muted hover:text-danger transition-colors"
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
							Add Alert
						</h3>
						<button @click="closeModal" class="p-2 text-text-muted hover:text-text-main transition-colors">
							<X :size="20" :stroke-width="2" />
						</button>
					</div>

					<form @submit.prevent="handleSubmit" class="space-y-4">
						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Symbol
							</label>
							<input
								v-model="newSymbol"
								type="text"
								placeholder="e.g. BTC/USDT"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Alert Type
							</label>
							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									@click="newType = 'horizontal'"
									:class="[
										'py-2 text-[10px] font-heading font-bold tracking-widest uppercase border transition-all duration-150',
										newType === 'horizontal'
											? 'border-primary bg-primary/10 text-primary'
											: 'border-border text-text-muted hover:border-text-muted/50 hover:text-text-main'
									]"
								>
									Horizontal Price
								</button>
								<button
									type="button"
									@click="newType = 'trendline'"
									:class="[
										'py-2 text-[10px] font-heading font-bold tracking-widest uppercase border transition-all duration-150',
										newType === 'trendline'
											? 'border-primary bg-primary/10 text-primary'
											: 'border-border text-text-muted hover:border-text-muted/50 hover:text-text-main'
									]"
								>
									Trendline
								</button>
							</div>
						</div>

						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Condition
							</label>
							<select
								v-model="newCondition"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							>
								<option
									v-for="cond in conditions"
									:key="cond"
									:value="cond"
									class="bg-background"
								>
									{{ cond }}
								</option>
							</select>
						</div>

						<!-- Horizontal Price field -->
						<div v-if="newType === 'horizontal'">
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Price
							</label>
							<input
								v-model="newPrice"
								type="number"
								step="0.000001"
								placeholder="e.g. 50000"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<!-- Trendline fields -->
						<div v-else class="space-y-4">
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
										Start Price
									</label>
									<input
										v-model="newStartPrice"
										type="number"
										step="0.000001"
										placeholder="e.g. 50000"
										class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
									/>
								</div>
								<div>
									<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
										Start Time
									</label>
									<input
										v-model="newStartTime"
										type="datetime-local"
										class="w-full bg-transparent border border-border px-3 py-2 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100 [color-scheme:dark]"
									/>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
										End Price
									</label>
									<input
										v-model="newEndPrice"
										type="number"
										step="0.000001"
										placeholder="e.g. 60000"
										class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
									/>
								</div>
								<div>
									<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
										End Time
									</label>
									<input
										v-model="newEndTime"
										type="datetime-local"
										class="w-full bg-transparent border border-border px-3 py-2 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100 [color-scheme:dark]"
									/>
								</div>
							</div>
						</div>

						<button
							type="submit"
							:disabled="!isFormValid"
							:class="[
								'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
								isFormValid
									? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
									: 'bg-border text-text-muted cursor-not-allowed',
							]"
						>
							Add Alert
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
