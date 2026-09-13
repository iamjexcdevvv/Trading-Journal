<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Bell, CalendarDays, ChevronDown, Menu, Search } from "lucide-vue-next";
import NavigationSidebar from "./components/NavigationSidebar.vue";
import { useAuth } from "./composables/useAuth.js";
import { useTrades } from "./composables/useTrades.js";
import { useSocket } from "./composables/useSocket.js";
import { useQueryClient } from "@tanstack/vue-query";

const route = useRoute();
const router = useRouter();
const { logout } = useAuth();
const { clearTrades } = useTrades();
const { socket } = useSocket();
const queryClient = useQueryClient();
const sidebarOpen = ref(false);
const isAuthPage = computed(() => ["/login", "/register", "/auth/callback"].includes(route.path));
const pageTitle = computed(() => route.meta.title || "Dashboard");

async function handleLogout() {
	try {
		await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
	} catch (error) {
		console.error("Logout error:", error);
	} finally {
		logout();
		clearTrades();
		router.push("/login");
	}
}

function handleAlertTriggered(data) {
	queryClient.invalidateQueries({ queryKey: ["alerts"] });
	if (data?.alert) alert(`ALERT TRIGGERED: ${data.alert.symbol} is ${data.actionMessage} at $${data.currentPrice}!`);
}

function handleAlertExpired(data) {
	queryClient.invalidateQueries({ queryKey: ["alerts"] });
	console.log(`Alert expired: ${data.symbol}`);
}

function handleTradeSynced(trade) {
	queryClient.invalidateQueries({ queryKey: ["trades"] });
	console.log(`Trade synced from ${trade.exchange}: ${trade.symbol} (${trade.status})`);
}

onMounted(() => {
	socket.on("alert-triggered", handleAlertTriggered);
	socket.on("alert-expired", handleAlertExpired);
	socket.on("trade-synced", handleTradeSynced);
});

onUnmounted(() => {
	socket.off("alert-triggered", handleAlertTriggered);
	socket.off("alert-expired", handleAlertExpired);
	socket.off("trade-synced", handleTradeSynced);
});
</script>

<template>
	<router-view v-if="isAuthPage" />
	<div v-else class="app-shell">
		<div v-if="sidebarOpen" class="sidebar-scrim" @click="sidebarOpen = false"></div>
		<NavigationSidebar :is-mobile-open="sidebarOpen" @close="sidebarOpen = false" @logout="handleLogout" />
		<div class="app-workspace">
			<header class="topbar">
				<div class="topbar-title">
					<button class="icon-button mobile-menu" aria-label="Open menu" @click="sidebarOpen = true"><Menu :size="19" /></button>
					<div><p class="eyebrow">Overview</p><h1>{{ pageTitle }}</h1></div>
				</div>
				<div class="topbar-actions">
					<button class="toolbar-button hide-tablet"><CalendarDays :size="15" /><span>Sep 01 — Sep 13</span><ChevronDown :size="14" /></button>
					<button class="icon-button" aria-label="Search"><Search :size="18" /></button>
					<button class="icon-button notification-button" aria-label="Notifications"><Bell :size="18" /><span></span></button>
					<button class="topbar-avatar" aria-label="Open profile">EH</button>
				</div>
			</header>
			<main class="page-content"><router-view /></main>
		</div>
	</div>
</template>
