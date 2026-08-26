<script setup>
import { ref } from "vue";
import { Plus, Trash2, Edit2, X, ShieldCheck } from "lucide-vue-next";
import { useTradingRules } from "../composables/useTradingRules.js";
import Loading from "./Loading.vue";

const { tradingRules, createTradingRule, updateTradingRule, deleteTradingRule, isLoading } = useTradingRules();

const isModalOpen = ref(false);
const editingRule = ref(null);
const ruleText = ref("");
const ruleRequired = ref(true);

const openModal = () => {
	editingRule.value = null;
	ruleText.value = "";
	ruleRequired.value = true;
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	editingRule.value = null;
	ruleText.value = "";
	ruleRequired.value = true;
};

const handleEdit = (rule) => {
	editingRule.value = rule;
	ruleText.value = rule.text;
	ruleRequired.value = rule.required !== false;
	isModalOpen.value = true;
};

const handleSubmit = () => {
	if (!ruleText.value.trim()) return;

	if (editingRule.value) {
		updateTradingRule({
			id: editingRule.value._id,
			text: ruleText.value.trim(),
			required: ruleRequired.value,
		});
	} else {
		createTradingRule({
			text: ruleText.value.trim(),
			required: ruleRequired.value,
		});
	}

	closeModal();
};

const handleDelete = (id) => {
	if (confirm("Are you sure you want to delete this trading rule?")) {
		deleteTradingRule(id);
	}
};
</script>

<template>
	<div class="border border-border bg-surface/40 p-4 relative" data-testid="trading-rules-manager">
		<!-- Loading Overlay -->
		<div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-surface/40 z-10">
			<Loading message="Loading trading rules..." />
		</div>

		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<ShieldCheck :size="16" :stroke-width="2" class="text-text-muted" />
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Trading Rules
				</span>
			</div>
			<button
				@click="openModal"
				class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-heading font-bold text-xs tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
				data-testid="add-trading-rule-btn"
			>
				<Plus :size="12" :stroke-width="2.5" />
				Add Rule
			</button>
		</div>

		<div v-if="!tradingRules || tradingRules.length === 0" class="text-text-muted/40 font-mono text-xs">
			No trading rules configured
		</div>
		<ul v-else class="space-y-1.5">
			<li
				v-for="rule in tradingRules"
				:key="rule._id"
				class="flex items-center justify-between px-3 py-2 bg-surface/30 border border-border rounded"
				data-testid="trading-rule-item"
			>
				<span class="font-sans text-sm text-text-main">
					{{ rule.text }}
					<span v-if="rule.required === false" class="ml-1.5 font-mono text-[9px] text-text-muted/50 tracking-widest uppercase">
						optional
					</span>
				</span>
				<div class="flex items-center gap-2">
					<button
						@click="handleEdit(rule)"
						class="p-1 text-text-muted hover:text-text-main transition-colors"
					>
						<Edit2 :size="12" :stroke-width="2" />
					</button>
					<button
						@click="handleDelete(rule._id)"
						class="p-1 text-text-muted hover:text-danger transition-colors"
					>
						<Trash2 :size="12" :stroke-width="2" />
					</button>
				</div>
			</li>
		</ul>
	</div>

	<!-- Modal -->
	<Teleport to="body">
		<Transition name="modal">
			<div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
				<div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="closeModal"></div>
				<div class="relative w-full max-w-md bg-background border border-border rounded-lg shadow-2xl p-6 max-h-[90vh] overflow-auto">
					<div class="flex items-center justify-between mb-4">
						<h3 class="font-heading font-black text-lg tracking-tight uppercase">
							{{ editingRule ? 'Edit Rule' : 'Add Rule' }}
						</h3>
						<button @click="closeModal" class="p-2 text-text-muted hover:text-text-main transition-colors">
							<X :size="20" :stroke-width="2" />
						</button>
					</div>

					<form @submit.prevent="handleSubmit" class="space-y-4">
						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Rule
							</label>
							<input
								v-model="ruleText"
								type="text"
								placeholder="e.g. Risk no more than 1% per trade"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
								data-testid="trading-rule-text-input"
							/>
						</div>

						<div class="flex items-center justify-between">
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted">
								Required before logging
							</label>
							<button
								type="button"
								@click="ruleRequired = !ruleRequired"
								:class="[
									'px-2 py-1 font-mono text-[9px] tracking-widest uppercase border rounded transition-colors',
									ruleRequired
										? 'border-primary/40 text-primary'
										: 'border-border text-text-muted',
								]"
								data-testid="trading-rule-required-toggle"
							>
								{{ ruleRequired ? 'Required' : 'Optional' }}
							</button>
						</div>

						<button
							type="submit"
							:disabled="!ruleText.trim()"
							:class="[
								'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
								ruleText.trim()
									? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
									: 'bg-border text-text-muted cursor-not-allowed',
							]"
							data-testid="submit-trading-rule-btn"
						>
							{{ editingRule ? 'Update Rule' : 'Add Rule' }}
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
