<script setup>
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { BookOpen, BarChart3, Calculator, Settings, X } from "lucide-vue-next";

const props = defineProps({
	isMobileOpen: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const router = useRouter();
const route = useRoute();

const navItems = computed(() => [
	{
		path: "/trade-logging",
		label: "Trade Logging",
		icon: BookOpen,
		testid: "nav-trade-logging",
	},
	{
		path: "/pnl-analysis",
		label: "Performance",
		icon: BarChart3,
		testid: "nav-pnl-analysis",
	},
	{
		path: "/calculator",
		label: "Calculator",
		icon: Calculator,
		testid: "nav-calculator",
	},
	{
		path: "/settings",
		label: "Settings",
		icon: Settings,
		testid: "nav-settings",
	},
]);

const isActive = (path) => route.path === path;

const navigate = (path) => {
	router.push(path);
	emit("close");
};

const closeSidebar = () => {
	emit("close");
};
</script>

<template>
	<aside
		:class="[
			'fixed inset-y-0 left-0 z-50 lg:relative lg:inset-auto lg:z-auto transition-transform duration-300 ease-in-out',
			'w-64 border-r border-border bg-surface/40 flex flex-col',
			isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
		]"
		data-testid="navigation-sidebar"
	>
		<!-- Mobile Close Button -->
		<button
			@click="closeSidebar"
			class="lg:hidden absolute top-4 right-4 p-2 text-text-muted hover:text-text-main"
			data-testid="mobile-close-btn"
		>
			<X :size="20" :stroke-width="2" />
		</button>

		<!-- Nav Header -->
		<div class="h-12 flex items-center border-b border-border bg-background/80 backdrop-blur">
			<span class="px-4 **:font-heading font-black text-sm tracking-wider uppercase">
				Navigation
			</span>
		</div>

		<!-- Nav Items -->
		<nav class="flex-1 p-4 flex flex-col gap-1">
			<button
				v-for="item in navItems"
				:key="item.path"
				@click="navigate(item.path)"
				:class="[
					'w-full flex items-center gap-3 px-4 py-3 font-mono text-sm tracking-wider uppercase transition-colors duration-100',
					isActive(item.path)
						? 'bg-primary/15 text-primary border border-primary/30'
						: 'text-text-muted hover:bg-surface-hover hover:text-text-main border border-transparent',
				]"
				:data-testid="item.testid"
			>
				<component :is="item.icon" :size="16" :stroke-width="2" />
				<span>{{ item.label }}</span>
			</button>
		</nav>

		<!-- Footer -->
		<div class="px-6 py-4 border-t border-border">
			<div class="font-mono text-[10px] text-text-muted/60 tracking-widest uppercase">
				Dashboard v1.0
			</div>
		</div>
	</aside>
</template>
