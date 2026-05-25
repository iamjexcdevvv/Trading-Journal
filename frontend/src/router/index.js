import { createRouter, createWebHistory } from "vue-router";
import TradeLogging from "../views/TradeLogging.vue";
import PnLAnalysis from "../views/PnLAnalysis.vue";
import Calculator from "../views/Calculator.vue";

const routes = [
    {
        path: "/",
        redirect: "/trade-logging",
    },
    {
        path: "/trade-logging",
        name: "TradeLogging",
        component: TradeLogging,
    },
    {
        path: "/pnl-analysis",
        name: "PnLAnalysis",
        component: PnLAnalysis,
    },
    {
        path: "/calculator",
        name: "Calculator",
        component: Calculator,
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;
