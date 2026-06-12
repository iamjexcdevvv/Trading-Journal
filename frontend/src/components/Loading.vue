<script setup>
defineProps({
	message: {
		type: String,
		default: "Loading..."
	}
});
</script>

<template>
	<div class="flex flex-col items-center justify-center gap-4 p-8">
		<!-- Spinner -->
		<div class="relative w-12 h-12">
			<div class="absolute inset-0 border-4 border-border rounded-full"></div>
			<div class="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
		</div>
		
		<!-- Message -->
		<p class="font-mono text-xs text-text-muted tracking-widest uppercase">
			{{ message }}
		</p>
	</div>
</template>

<style scoped>
@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.animate-spin {
	animation: spin 1s linear infinite;
}
</style>
