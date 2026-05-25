import { createRouter, createWebHistory } from "vue-router";
import TradeLogging from "../views/TradeLogging.vue";
import PnLAnalysis from "../views/PnLAnalysis.vue";

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
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;
