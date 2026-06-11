<script setup>
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuth } from "../composables/useAuth.js";

const router = useRouter();
const route = useRoute();
const { setToken } = useAuth();

const error = ref("");
const isLoading = ref(true);

onMounted(() => {
	// Check if there's an access token in the query params or hash
	const accessToken = route.query.accessToken || route.hash?.match(/access_token=([^&]+)/)?.[1];

	if (accessToken) {
		// Store the token
		setToken(accessToken);
		// Redirect to main app
		router.push("/");
	} else {
		// Check for error in query params
		const errorParam = route.query.error;
		if (errorParam) {
			error.value = errorParam;
		} else {
			error.value = "Authentication failed. Please try again.";
		}
		isLoading.value = false;
	}
});
</script>

<template>
	<div class="min-h-screen flex items-center justify-center bg-background px-4">
		<div class="w-full max-w-md text-center">
			<div v-if="isLoading" class="space-y-4">
				<div
					class="w-16 h-16 bg-primary text-primary-foreground font-heading font-black flex items-center justify-center text-3xl mx-auto mb-4"
				>
					L
				</div>
				<h1 class="font-heading font-black text-2xl tracking-tight uppercase">
					Authenticating...
				</h1>
				<p class="font-mono text-xs text-text-muted tracking-widest uppercase">
					Please wait while we sign you in
				</p>
			</div>

			<div v-else class="space-y-4">
				<div
					class="w-16 h-16 bg-danger text-danger-foreground font-heading font-black flex items-center justify-center text-3xl mx-auto mb-4"
				>
					!
				</div>
				<h1 class="font-heading font-black text-2xl tracking-tight uppercase text-danger">
					Authentication Failed
				</h1>
				<p class="font-mono text-xs text-text-muted tracking-widest uppercase">
					{{ error }}
				</p>
				<button
					@click="router.push('/login')"
					class="mt-6 px-6 py-3 bg-primary text-primary-foreground font-heading font-bold text-sm tracking-widest uppercase hover:brightness-110 active:translate-y-px transition-all"
				>
					Back to Login
				</button>
			</div>
		</div>
	</div>
</template>
