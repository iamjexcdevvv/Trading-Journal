import { computed, ref } from "vue";

function toInputDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function presetStart(preset, end) {
	const start = new Date(end);
	if (preset === "1W") start.setDate(start.getDate() - 6);
	if (preset === "1M") start.setMonth(start.getMonth() - 1);
	if (preset === "3M") start.setMonth(start.getMonth() - 3);
	if (preset === "YTD") start.setMonth(0, 1);
	return start;
}

const today = new Date();
const startDate = ref(toInputDate(presetStart("1M", today)));
const endDate = ref(toInputDate(today));
const activePreset = ref("1M");

export function useDashboardRange() {
	function setPreset(preset) {
		activePreset.value = preset;
		if (preset === "ALL") {
			startDate.value = "";
			endDate.value = "";
			return;
		}

		const end = new Date();
		startDate.value = toInputDate(presetStart(preset, end));
		endDate.value = toInputDate(end);
	}

	function setCustomRange(start, end) {
		startDate.value = start;
		endDate.value = end;
		activePreset.value = "CUSTOM";
	}

	function includesDate(value) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return false;
		if (startDate.value && date < new Date(`${startDate.value}T00:00:00`)) return false;
		if (endDate.value && date > new Date(`${endDate.value}T23:59:59.999`)) return false;
		return true;
	}

	const label = computed(() => {
		if (!startDate.value && !endDate.value) return "All time";
		const format = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Any";
		return `${format(startDate.value)} — ${format(endDate.value)}`;
	});

	return { startDate, endDate, activePreset, label, setPreset, setCustomRange, includesDate };
}
