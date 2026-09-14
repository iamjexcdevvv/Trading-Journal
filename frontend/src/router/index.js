import { createRouter, createWebHistory } from "vue-router";
import TradeLogging from "../views/TradeLogging.vue";
import PnLAnalysis from "../views/PnLAnalysis.vue";
import Calculator from "../views/Calculator.vue";
import Settings from "../views/Settings.vue";
import Setups from "../views/Setups.vue";
import TradingRules from "../views/TradingRules.vue";
import Login from "../views/Login.vue";
import Register from "../views/Register.vue";
import OAuthCallback from "../views/OAuthCallback.vue";
import Dashboard from "../views/Dashboard.vue";
import AdminApprovals from "../views/AdminApprovals.vue";
import { useAuth } from "../composables/useAuth.js";

const routes = [
	{
		path: "/",
		redirect: "/dashboard",
	},
	{
		path: "/dashboard",
		name: "Dashboard",
		component: Dashboard,
		meta: { requiresAuth: true, title: "Dashboard" },
	},
	{
		path: "/admin/approvals",
		name: "AdminApprovals",
		component: AdminApprovals,
		meta: { requiresAuth: true, requiresAdmin: true, title: "Approvals" },
	},
	{
		path: "/login",
		name: "Login",
		component: Login,
		meta: { requiresGuest: true },
	},
	{
		path: "/register",
		name: "Register",
		component: Register,
		meta: { requiresGuest: true },
	},
	{
		path: "/auth/callback",
		name: "OAuthCallback",
		component: OAuthCallback,
		meta: { requiresGuest: true },
	},
	{
		path: "/trade-logging",
		name: "TradeLogging",
		component: TradeLogging,
		meta: { requiresAuth: true, title: "Trades" },
	},
	{
		path: "/pnl-analysis",
		name: "PnLAnalysis",
		component: PnLAnalysis,
		meta: { requiresAuth: true, title: "Analytics" },
	},
	{
		path: "/calculator",
		name: "Calculator",
		component: Calculator,
		meta: { requiresAuth: true, title: "Calculator" },
	},
	{
		path: "/settings",
		name: "Settings",
		component: Settings,
		meta: { requiresAuth: true, title: "Settings" },
	},
	{
		path: "/setups",
		name: "Setups",
		component: Setups,
		meta: { requiresAuth: true, title: "Playbook" },
	},
	{
		path: "/trading-rules",
		name: "TradingRules",
		component: TradingRules,
		meta: { requiresAuth: true, title: "Trading Rules" },
	},
];

const router = createRouter({
	history: createWebHistory(),
	routes,
});

// Navigation guard
router.beforeEach(async (to, from, next) => {
	const { isLoggedIn, setToken } = useAuth();
	const apiURL = import.meta.env.VITE_API_BASE_URL;

	// Protected routes - require authentication
	if (to.meta.requiresAuth && !isLoggedIn.value) {
		try {
			const res = await fetch(`${apiURL}/api/auth/refresh`, {
				method: "POST",
				credentials: "include",
			});

			if (res.ok) {
				const { accessToken } = await res.json();
				setToken(accessToken);
				next();
				return;
			}
		} catch (err) {
			console.error("Failed to refresh token:", err);
		}
		next("/login");
		return;
	}

	if (to.meta.requiresAdmin) {
		const { user } = useAuth();
		if (user.value.role !== "admin") {
			next("/dashboard");
			return;
		}
	}

	// Guest routes - redirect to app if already logged in
	if (to.meta.requiresGuest && isLoggedIn.value) {
		next("/dashboard");
		return;
	}

	next();
});

export default router;
