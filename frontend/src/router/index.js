import { createRouter, createWebHistory } from "vue-router";
import TradeLogging from "../views/TradeLogging.vue";
import PnLAnalysis from "../views/PnLAnalysis.vue";
import Calculator from "../views/Calculator.vue";
import Strategies from "../views/Strategies.vue";
import Login from "../views/Login.vue";
import Register from "../views/Register.vue";
import { useAuth } from "../composables/useAuth.js";

const routes = [
	{
		path: "/",
		redirect: "/trade-logging",
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
		path: "/trade-logging",
		name: "TradeLogging",
		component: TradeLogging,
		meta: { requiresAuth: true },
	},
	{
		path: "/pnl-analysis",
		name: "PnLAnalysis",
		component: PnLAnalysis,
		meta: { requiresAuth: true },
	},
	{
		path: "/calculator",
		name: "Calculator",
		component: Calculator,
		meta: { requiresAuth: true },
	},
	{
		path: "/settings",
		name: "Settings",
		component: Strategies,
		meta: { requiresAuth: true },
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

	// Guest routes - redirect to app if already logged in
	if (to.meta.requiresGuest && isLoggedIn.value) {
		next("/trade-logging");
		return;
	}

	next();
});

export default router;
