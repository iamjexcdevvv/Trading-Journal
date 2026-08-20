<script setup>
import { ref, watch } from "vue";
import { Plus, Trash2, Edit2, X, Check, ArrowUpRight, ArrowDownRight } from "lucide-vue-next";
import { useStrategies } from "../composables/useStrategies.js";
import Loading from "./Loading.vue";

const { strategies, createStrategy, updateStrategy, deleteStrategy, isLoading } = useStrategies();

const isModalOpen = ref(false);
const editingStrategy = ref(null);
const newStrategyName = ref("");
const newStrategyDirection = ref("Long");

const openModal = () => {
	editingStrategy.value = null;
	newStrategyName.value = "";
	newStrategyDirection.value = "Long";
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	editingStrategy.value = null;
	newStrategyName.value = "";
};

const handleEdit = (strategy) => {
	editingStrategy.value = strategy;
	newStrategyName.value = strategy.name;
	newStrategyDirection.value = strategy.direction;
	isModalOpen.value = true;
};

const handleSubmit = () => {
	if (!newStrategyName.value.trim()) return;

	if (editingStrategy.value) {
		updateStrategy({
			id: editingStrategy.value._id,
			name: newStrategyName.value.trim(),
			direction: newStrategyDirection.value,
		});
	} else {
		createStrategy({
			name: newStrategyName.value.trim(),
			direction: newStrategyDirection.value,
		});
	}

	closeModal();
};

const handleDelete = (id) => {
	if (confirm("Are you sure you want to delete this strategy?")) {
		deleteStrategy(id);
	}
};

const groupedStrategies = ref({
	Long: [],
	Short: [],
});

// Watch strategies to update grouping
watch(
	() => strategies.value,
	(newStrategies) => {
		if (!newStrategies) return;
		groupedStrategies.value = newStrategies.reduce((acc, strategy) => {
			if (!acc[strategy.direction]) {
				acc[strategy.direction] = [];
			}
			acc[strategy.direction].push(strategy);
			return acc;
		}, { Long: [], Short: [] });
	},
	{ immediate: true }
);
</script>

<template>
	<div class="border border-border bg-surface/40 p-4 relative">
		<!-- Loading Overlay -->
		<div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-surface/40 z-10">
			<Loading message="Loading strategies..." />
		</div>

		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<Plus :size="16" :stroke-width="2" class="text-text-muted" />
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Strategies
				</span>
			</div>
			<button
				@click="openModal"
				class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-heading font-bold text-xs tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
			>
				<Plus :size="12" :stroke-width="2.5" />
				Add Strategy
			</button>
		</div>

		<!-- Long Strategies -->
		<div class="mb-4">
			<div class="flex items-center gap-2 mb-2">
				<ArrowUpRight :size="14" :stroke-width="2" class="text-success" />
				<span class="font-mono text-xs tracking-widest uppercase text-text-muted">Long</span>
			</div>
			<div v-if="groupedStrategies.Long.length === 0" class="text-text-muted/40 font-mono text-xs">
				No long strategies configured
			</div>
			<div v-else class="space-y-2">
				<div
					v-for="strategy in groupedStrategies.Long"
					:key="strategy._id"
					class="flex items-center justify-between px-3 py-2 bg-surface/30 border border-border rounded"
				>
					<span class="font-sans text-sm text-text-main">{{ strategy.name }}</span>
					<div class="flex items-center gap-2">
						<button
							@click="handleEdit(strategy)"
							class="p-1 text-text-muted hover:text-text-main transition-colors"
						>
							<Edit2 :size="12" :stroke-width="2" />
						</button>
						<button
							@click="handleDelete(strategy._id)"
							class="p-1 text-text-muted hover:text-danger transition-colors"
						>
							<Trash2 :size="12" :stroke-width="2" />
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Short Strategies -->
		<div>
			<div class="flex items-center gap-2 mb-2">
				<ArrowDownRight :size="14" :stroke-width="2" class="text-danger" />
				<span class="font-mono text-xs tracking-widest uppercase text-text-muted">Short</span>
			</div>
			<div v-if="groupedStrategies.Short.length === 0" class="text-text-muted/40 font-mono text-xs">
				No short strategies configured
			</div>
			<div v-else class="space-y-2">
				<div
					v-for="strategy in groupedStrategies.Short"
					:key="strategy._id"
					class="flex items-center justify-between px-3 py-2 bg-surface/30 border border-border rounded"
				>
					<span class="font-sans text-sm text-text-main">{{ strategy.name }}</span>
					<div class="flex items-center gap-2">
						<button
							@click="handleEdit(strategy)"
							class="p-1 text-text-muted hover:text-text-main transition-colors"
						>
							<Edit2 :size="12" :stroke-width="2" />
						</button>
						<button
							@click="handleDelete(strategy._id)"
							class="p-1 text-text-muted hover:text-danger transition-colors"
						>
							<Trash2 :size="12" :stroke-width="2" />
						</button>
					</div>
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
							{{ editingStrategy ? 'Edit Strategy' : 'Add Strategy' }}
						</h3>
						<button @click="closeModal" class="p-2 text-text-muted hover:text-text-main transition-colors">
							<X :size="20" :stroke-width="2" />
						</button>
					</div>

					<form @submit.prevent="handleSubmit" class="space-y-4">
						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Strategy Name
							</label>
							<input
								v-model="newStrategyName"
								type="text"
								placeholder="e.g. Trendline Breakout"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Direction
							</label>
							<div class="grid grid-cols-2 border border-border">
								<button
									type="button"
									@click="newStrategyDirection = 'Long'"
									:class="[
										'flex items-center justify-center gap-2 py-2.5 font-mono text-sm tracking-widest uppercase transition-colors duration-100 border-r border-border',
										newStrategyDirection === 'Long'
											? 'bg-success/15 text-success'
											: 'text-text-muted hover:bg-surface-hover hover:text-text-main',
									]"
								>
									<ArrowUpRight :size="16" :stroke-width="2.5" />
									Long
								</button>
								<button
									type="button"
									@click="newStrategyDirection = 'Short'"
									:class="[
										'flex items-center justify-center gap-2 py-2.5 font-mono text-sm tracking-widest uppercase transition-colors duration-100',
										newStrategyDirection === 'Short'
											? 'bg-danger/15 text-danger'
											: 'text-text-muted hover:bg-surface-hover hover:text-text-main',
									]"
								>
									<ArrowDownRight :size="16" :stroke-width="2.5" />
									Short
								</button>
							</div>
						</div>

						<button
							type="submit"
							:disabled="!newStrategyName.trim()"
							:class="[
								'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
								newStrategyName.trim()
									? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
									: 'bg-border text-text-muted cursor-not-allowed',
							]"
						>
							{{ editingStrategy ? 'Update Strategy' : 'Add Strategy' }}
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
