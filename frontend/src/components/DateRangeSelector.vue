<script setup>
import { ref, watch } from "vue";
import { CalendarDays, ChevronDown } from "lucide-vue-next";
import { useDashboardRange } from "../composables/useDashboardRange.js";

const { startDate, endDate, label, setCustomRange, setPreset } = useDashboardRange();
const open = ref(false);
const draftStart = ref(startDate.value);
const draftEnd = ref(endDate.value);

watch(open, (isOpen) => {
	if (!isOpen) return;
	draftStart.value = startDate.value;
	draftEnd.value = endDate.value;
});

function apply() {
	if (draftStart.value && draftEnd.value && draftStart.value > draftEnd.value) return;
	setCustomRange(draftStart.value, draftEnd.value);
	open.value = false;
}
</script>

<template>
	<div class="date-range-selector">
		<button class="toolbar-button" :aria-expanded="open" @click="open = !open">
			<CalendarDays :size="15" /><span>{{ label }}</span><ChevronDown :size="14" />
		</button>
		<div v-if="open" class="date-range-popover">
			<label><span>Start date</span><input v-model="draftStart" type="date" :max="draftEnd || undefined" /></label>
			<label><span>End date</span><input v-model="draftEnd" type="date" :min="draftStart || undefined" /></label>
			<div class="date-range-actions">
				<button @click="setPreset('ALL'); open = false">All time</button>
				<button class="apply" :disabled="draftStart && draftEnd && draftStart > draftEnd" @click="apply">Apply</button>
			</div>
		</div>
	</div>
</template>
