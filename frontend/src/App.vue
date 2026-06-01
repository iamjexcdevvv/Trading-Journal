<script setup>
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import NavigationSidebar from "./components/NavigationSidebar.vue";
import { Menu, LogOut } from "lucide-vue-next";
import { useAuth } from "./composables/useAuth.js";
import { useTrades } from "./composables/useTrades.js";
import { useRouter } from "vue-router";

const apiURL = import.meta.env.VITE_API_BASE_URL;

const route = useRoute();
const router = useRouter();
const { logout } = useAuth();
const { clearTrades } = useTrades();

const isMobileSidebarOpen = ref(false);

const isAuthPage = computed(() => {
	return route.path === "/login" || route.path === "/register";
});

const toggleMobileSidebar = () => {
	isMobileSidebarOpen.value = !isMobileSidebarOpen.value;
};

const closeMobileSidebar = () => {
	isMobileSidebarOpen.value = false;
};

const handleLogout = async () => {
	try {
		await fetch(`${apiURL}/api/auth/logout`, {
			method: "POST",
			credentials: "include",
		});
	} catch (err) {
		console.error("Logout error:", err);
	} finally {
		logout();
		clearTrades();
		router.push("/login");
	}
};
</script>

<template>
	<div class="min-h-screen bg-background text-text-main flex flex-col">
		<!-- ===== TOP HEADER ===== -->
		<header
			v-if="!isAuthPage"
			class="h-16 border-b border-border flex items-center justify-between px-6 shrink-0"
			data-testid="app-header"
		>
			<div class="flex items-center gap-3">
				<!-- Hamburger Menu Button (Mobile) -->
				<button
					@click="toggleMobileSidebar"
					class="lg:hidden p-2 text-text-muted hover:text-text-main"
					data-testid="hamburger-menu-btn"
				>
					<Menu :size="24" :stroke-width="2" />
				</button>

				<img src="/logo.jpg" alt="Logo" class="w-8 h-8 object-cover rounded" />
				<div class="flex flex-col leading-tight">
					<span class="font-heading font-black tracking-tight text-base">
						Plan2Profit
					</span>
					<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
						Trading Journal · v0.1
					</span>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<div class="hidden md:flex items-center gap-2 font-mono text-xs text-text-muted">
					<span class="w-2 h-2 bg-success animate-pulse"></span>
					<span class="tracking-widest uppercase">Session Active</span>
				</div>
				<button
					@click="handleLogout"
					class="flex items-center gap-2 px-3 py-1.5 border border-border bg-surface/40 hover:bg-surface-hover/60 transition-colors font-mono text-xs tracking-wider uppercase text-text-muted hover:text-text-main"
				>
					<LogOut :size="14" :stroke-width="2" />
					Logout
				</button>
			</div>
		</header>

		<!-- ===== MAIN GRID ===== -->
		<main class="flex-1 min-h-0 relative">
			<!-- Auth Pages Layout -->
			<div v-if="isAuthPage" class="min-h-full">
				<router-view />
			</div>

			<!-- App Pages Layout -->
			<div v-else class="grid grid-cols-1 lg:grid-cols-11 min-h-0">
				<!-- Mobile Overlay -->
				<div
					v-if="isMobileSidebarOpen"
					@click="closeMobileSidebar"
					class="fixed inset-0 bg-black/50 z-40 lg:hidden"
					data-testid="mobile-overlay"
				></div>

				<!-- Navigation Sidebar -->
				<NavigationSidebar
					:is-mobile-open="isMobileSidebarOpen"
					@close="closeMobileSidebar"
				/>

				<!-- Router View -->
				<section class="lg:col-span-10 min-h-0">
					<router-view />
				</section>
			</div>
		</main>

		<!-- ===== FOOTER ===== -->
		<footer
			v-if="!isAuthPage"
			class="border-t border-border px-6 h-10 flex items-center justify-between text-[11px] font-mono text-text-muted tracking-widest uppercase"
			data-testid="app-footer"
		>
			<span class="hidden sm:inline">Made for traders who keep score</span>
		</footer>
	</div>
</template>
