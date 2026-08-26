<script setup>
import { ref, computed } from "vue";
import { Plus, Trash2, Edit2, X, ListChecks } from "lucide-vue-next";
import { useSetups } from "../composables/useSetups.js";
import { useStrategies } from "../composables/useStrategies.js";
import Loading from "./Loading.vue";

const { setups, createSetup, updateSetup, deleteSetup, isLoading } = useSetups();
const { strategies } = useStrategies();

// Dedupe names — a strategy can exist as both a Long and a Short entry under the same name
const strategyNames = computed(() => [...new Set((strategies.value || []).map((s) => s.name))]);

// A strategy that already has a setup is excluded from the picker (except the one
// currently being edited) so two setups can't end up pointing at the same strategy —
// that would show as indistinguishable duplicate entries in the trade-log Setup dropdown.
const usedStrategyNames = computed(() => new Set(
	(setups.value || [])
		.filter((s) => !editingSetup.value || s._id !== editingSetup.value._id)
		.map((s) => s.name)
));
const availableStrategyNames = computed(() =>
	strategyNames.value.filter((name) => !usedStrategyNames.value.has(name))
);

const isModalOpen = ref(false);
const editingSetup = ref(null);
const newSetupName = ref("");
const newSetupItems = ref([]);
const newItemText = ref("");

const openModal = () => {
	editingSetup.value = null;
	newSetupName.value = "";
	newSetupItems.value = [];
	newItemText.value = "";
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	editingSetup.value = null;
	newSetupName.value = "";
	newSetupItems.value = [];
	newItemText.value = "";
};

const handleEdit = (setup) => {
	editingSetup.value = setup;
	newSetupName.value = setup.name;
	newSetupItems.value = [...(setup.items || [])];
	newItemText.value = "";
	isModalOpen.value = true;
};

const addItem = () => {
	const text = newItemText.value.trim();
	if (!text) return;
	newSetupItems.value.push(text);
	newItemText.value = "";
};

const removeItem = (index) => {
	newSetupItems.value.splice(index, 1);
};

const handleSubmit = () => {
	if (!newSetupName.value.trim()) return;

	if (editingSetup.value) {
		updateSetup({
			id: editingSetup.value._id,
			name: newSetupName.value.trim(),
			items: newSetupItems.value,
		});
	} else {
		createSetup({
			name: newSetupName.value.trim(),
			items: newSetupItems.value,
		});
	}

	closeModal();
};

const handleDelete = (id) => {
	if (confirm("Are you sure you want to delete this setup?")) {
		deleteSetup(id);
	}
};
</script>

<template>
	<div class="border border-border bg-surface/40 p-4 relative" data-testid="setups-manager">
		<!-- Loading Overlay -->
		<div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-surface/40 z-10">
			<Loading message="Loading setups..." />
		</div>

		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<ListChecks :size="16" :stroke-width="2" class="text-text-muted" />
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Setups
				</span>
			</div>
			<button
				@click="openModal"
				class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-heading font-bold text-xs tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
				data-testid="add-setup-btn"
			>
				<Plus :size="12" :stroke-width="2.5" />
				Add Setup
			</button>
		</div>

		<div v-if="!setups || setups.length === 0" class="text-text-muted/40 font-mono text-xs">
			No setups configured
		</div>
		<div v-else class="space-y-2">
			<div
				v-for="setup in setups"
				:key="setup._id"
				class="px-3 py-2 bg-surface/30 border border-border rounded"
				data-testid="setup-item"
			>
				<div class="flex items-center justify-between">
					<span class="font-sans text-sm text-text-main">{{ setup.name }}</span>
					<div class="flex items-center gap-2">
						<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
							{{ (setup.items || []).length }} {{ (setup.items || []).length === 1 ? 'item' : 'items' }}
						</span>
						<button
							@click="handleEdit(setup)"
							class="p-1 text-text-muted hover:text-text-main transition-colors"
						>
							<Edit2 :size="12" :stroke-width="2" />
						</button>
						<button
							@click="handleDelete(setup._id)"
							class="p-1 text-text-muted hover:text-danger transition-colors"
						>
							<Trash2 :size="12" :stroke-width="2" />
						</button>
					</div>
				</div>
				<ul v-if="(setup.items || []).length > 0" class="mt-2 space-y-1">
					<li
						v-for="(item, idx) in setup.items"
						:key="idx"
						class="font-mono text-xs text-text-muted flex items-center gap-1.5"
					>
						<span class="text-text-muted/40">-</span>
						{{ item }}
					</li>
				</ul>
			</div>
		</div>
	</div>

	<!-- Modal -->
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
				<div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeModal"></div>
				<div class="relative w-full max-w-md bg-background border border-border rounded-lg shadow-2xl p-6 max-h-[90vh] overflow-auto">
					<div class="flex items-center justify-between mb-4">
						<h3 class="font-heading font-black text-lg tracking-tight uppercase">
							{{ editingSetup ? 'Edit Setup' : 'Add Setup' }}
						</h3>
						<button @click="closeModal" class="p-2 text-text-muted hover:text-text-main transition-colors">
							<X :size="20" :stroke-width="2" />
						</button>
					</div>

					<form @submit.prevent="handleSubmit" class="space-y-4">
						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Strategy
							</label>
							<select
								v-model="newSetupName"
								:disabled="availableStrategyNames.length === 0"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
								data-testid="setup-name-input"
							>
								<option value="" disabled class="bg-background">Select strategy…</option>
								<option
									v-for="name in availableStrategyNames"
									:key="name"
									:value="name"
									class="bg-background text-text-main"
								>
									{{ name }}
								</option>
							</select>
							<p v-if="strategyNames.length === 0" class="mt-1.5 font-mono text-[10px] text-text-muted/60">
								No strategies configured yet — add one in Settings first.
							</p>
							<p v-else-if="availableStrategyNames.length === 0" class="mt-1.5 font-mono text-[10px] text-text-muted/60">
								Every strategy already has a setup — edit an existing one instead.
							</p>
						</div>

						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Confluences / Confirmations
							</label>
							<div class="flex gap-2 mb-2">
								<input
									v-model="newItemText"
									type="text"
									placeholder="e.g. Price above 200 EMA"
									@keydown.enter.prevent="addItem"
									class="flex-1 bg-transparent border border-border px-3 py-2 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
									data-testid="setup-item-input"
								/>
								<button
									type="button"
									@click="addItem"
									:disabled="!newItemText.trim()"
									:class="[
										'px-3 flex items-center justify-center border transition-colors',
										newItemText.trim()
											? 'border-primary text-primary hover:bg-primary/10'
											: 'border-border text-text-muted cursor-not-allowed',
									]"
									data-testid="add-setup-item-btn"
								>
									<Plus :size="16" :stroke-width="2.5" />
								</button>
							</div>
							<div v-if="newSetupItems.length === 0" class="text-text-muted/40 font-mono text-xs">
								No checklist items yet
							</div>
							<ul v-else class="space-y-1.5">
								<li
									v-for="(item, idx) in newSetupItems"
									:key="idx"
									class="flex items-center justify-between px-2.5 py-1.5 bg-surface/30 border border-border rounded"
									data-testid="setup-item-row"
								>
									<span class="font-sans text-xs text-text-main">{{ item }}</span>
									<button
										type="button"
										@click="removeItem(idx)"
										class="p-0.5 text-text-muted hover:text-danger transition-colors"
									>
										<X :size="12" :stroke-width="2.5" />
									</button>
								</li>
							</ul>
						</div>

						<button
							type="submit"
							:disabled="!newSetupName.trim()"
							:class="[
								'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
								newSetupName.trim()
									? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
									: 'bg-border text-text-muted cursor-not-allowed',
							]"
							data-testid="submit-setup-btn"
						>
							{{ editingSetup ? 'Update Setup' : 'Add Setup' }}
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
