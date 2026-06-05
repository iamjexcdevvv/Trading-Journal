<script setup>
import { ref } from "vue";
import { Plus, Trash2, Edit2, X, Tag as TagIcon } from "lucide-vue-next";
import { useTags } from "../composables/useTags.js";

const { tags, createTag, updateTag, deleteTag } = useTags();

const isModalOpen = ref(false);
const editingTag = ref(null);
const newTagName = ref("");

const openModal = () => {
	editingTag.value = null;
	newTagName.value = "";
	isModalOpen.value = true;
};

const closeModal = () => {
	isModalOpen.value = false;
	editingTag.value = null;
	newTagName.value = "";
};

const handleEdit = (tag) => {
	editingTag.value = tag;
	newTagName.value = tag.name;
	isModalOpen.value = true;
};

const handleSubmit = () => {
	if (!newTagName.value.trim()) return;

	if (editingTag.value) {
		updateTag({
			id: editingTag.value._id,
			name: newTagName.value.trim(),
		});
	} else {
		createTag({
			name: newTagName.value.trim(),
		});
	}

	closeModal();
};

const handleDelete = (id) => {
	if (confirm("Are you sure you want to delete this tag?")) {
		deleteTag(id);
	}
};
</script>

<template>
	<div class="border border-border bg-surface/40 p-4">
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<TagIcon :size="16" :stroke-width="2" class="text-text-muted" />
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Tags
				</span>
			</div>
			<button
				@click="openModal"
				class="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-heading font-bold text-xs tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
			>
				<Plus :size="12" :stroke-width="2.5" />
				Add Tag
			</button>
		</div>

		<div v-if="!tags || tags.length === 0" class="text-text-muted/40 font-mono text-xs">
			No tags configured
		</div>
		<div v-else class="space-y-2">
			<div
				v-for="tag in tags"
				:key="tag._id"
				class="flex items-center justify-between px-3 py-2 bg-surface/30 border border-border rounded"
			>
				<span class="font-sans text-sm text-text-main">{{ tag.name }}</span>
				<div class="flex items-center gap-2">
					<button
						@click="handleEdit(tag)"
						class="p-1 text-text-muted hover:text-text-main transition-colors"
					>
						<Edit2 :size="12" :stroke-width="2" />
					</button>
					<button
						@click="handleDelete(tag._id)"
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
							{{ editingTag ? 'Edit Tag' : 'Add Tag' }}
						</h3>
						<button @click="closeModal" class="p-2 text-text-muted hover:text-text-main transition-colors">
							<X :size="20" :stroke-width="2" />
						</button>
					</div>

					<form @submit.prevent="handleSubmit" class="space-y-4">
						<div>
							<label class="font-mono text-[10px] tracking-widest uppercase text-text-muted block mb-1.5">
								Tag Name
							</label>
							<input
								v-model="newTagName"
								type="text"
								placeholder="e.g. scalping"
								class="w-full bg-transparent border border-border px-3 py-2.5 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
							/>
						</div>

						<button
							type="submit"
							:disabled="!newTagName.trim()"
							:class="[
								'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
								newTagName.trim()
									? 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px'
									: 'bg-border text-text-muted cursor-not-allowed',
							]"
						>
							{{ editingTag ? 'Update Tag' : 'Add Tag' }}
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
