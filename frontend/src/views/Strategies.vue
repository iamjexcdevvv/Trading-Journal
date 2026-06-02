<script setup>
import StrategiesManager from "../components/StrategiesManager.vue";
</script>

<template>
	<div class="h-full flex flex-col min-h-0 bg-background" data-testid="strategies-page">
		<!-- Header -->
		<div
			class="lg:ml-34 px-6 h-12 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur shrink-0"
		>
			<div class="flex items-center gap-3">
				<span class="font-heading font-black text-sm tracking-widest uppercase">
					Strategies Management
				</span>
				<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
					// CUSTOMIZE YOUR TRADING STRATEGIES
				</span>
			</div>
		</div>

		<!-- Main Content -->
		<div class="flex-1 lg:ml-34 overflow-auto p-6">
			<div class="max-w-2xl mx-auto">
				<StrategiesManager />
			</div>
		</div>
	</div>
</template>
