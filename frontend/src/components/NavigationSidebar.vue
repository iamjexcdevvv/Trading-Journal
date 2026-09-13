<script setup>
import { useRoute, useRouter } from "vue-router";
import { BarChart3, Calculator, LayoutDashboard, Library, LogOut, ReceiptText, Settings, ShieldCheck, X } from "lucide-vue-next";
import { useTrades } from "../composables/useTrades.js";

defineProps({ isMobileOpen: { type: Boolean, default: false } });
const emit = defineEmits(["close", "logout"]);
const route = useRoute();
const router = useRouter();
const { trades } = useTrades();
const navItems = [
	{ path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ path: "/trade-logging", label: "Trades", icon: ReceiptText },
	{ path: "/pnl-analysis", label: "Analytics", icon: BarChart3 },
	{ path: "/calculator", label: "Calculator", icon: Calculator },
	{ path: "/setups", label: "Playbook", icon: Library },
	{ path: "/trading-rules", label: "Trading Rules", icon: ShieldCheck },
];
function navigate(path) { router.push(path); emit("close"); }
</script>

<template>
	<aside :class="['sidebar', { 'sidebar-open': isMobileOpen }]">
		<div class="brand-row">
			<div class="brand-mark">P</div>
			<div class="brand-copy"><strong>Plan2Profit</strong><span>Trading Journal</span></div>
			<button class="sidebar-close" aria-label="Close menu" @click="emit('close')"><X :size="19" /></button>
		</div>
		<nav class="sidebar-nav">
			<p class="nav-label">Workspace</p>
			<button v-for="item in navItems" :key="item.path" :class="['nav-item', { active: route.path === item.path }]" @click="navigate(item.path)">
				<component :is="item.icon" :size="18" :stroke-width="1.8" /><span>{{ item.label }}</span><span v-if="item.label === 'Trades'" class="nav-count">{{ trades.length }}</span>
			</button>
		</nav>
		<div class="sidebar-bottom">
			<button class="nav-item" @click="navigate('/settings')"><Settings :size="18" /><span>Settings</span></button>
			<div class="profile-card">
				<div class="profile-avatar">EH</div><div class="profile-copy"><strong>Eric Huang</strong><span>eric@plan2profit.co</span></div>
				<button aria-label="Log out" @click="emit('logout')"><LogOut :size="17" /></button>
			</div>
		</div>
	</aside>
</template>
