import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			refetchOnWindowFocus: false,
		},
	},
});

createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount("#app");
