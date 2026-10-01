<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth.js";
import { apiBaseUrl } from "../config/urls.js";

const apiURL = apiBaseUrl;

const router = useRouter();
const route = useRoute();
const { setToken } = useAuth();

const username = ref("");
const password = ref("");
const isLoading = ref(false);
const error = ref(route.query.approval === "pending" ? "Account awaiting administrator approval." : "");

const handleLogin = async () => {
	isLoading.value = true;
	error.value = "";

	try {
		const response = await fetch(`${apiURL}/api/auth/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				username: username.value,
				password: password.value,
			}),
		});

		if (!response.ok) {
			const data = await response.json();
			error.value = data.error || "Invalid credentials. Please try again.";
			return;
		}

		const data = await response.json();

		// Store token and user data
		setToken(data.accessToken);

		router.push("/");
	} catch (err) {
		console.error("Login error:", err);
		error.value = "An error occurred. Please try again.";
	} finally {
		isLoading.value = false;
	}
};

const handleSocialLogin = (provider) => {
	window.location.href = `${apiURL}/api/auth/${provider}`;
};

const goToRegister = () => {
	router.push("/register");
};
</script>

<template>
	<div class="min-h-screen flex items-center justify-center bg-background px-4">
		<div class="w-full max-w-md">
			<!-- Header -->
			<div class="text-center mb-8">
				<div
					class="w-16 h-16 bg-primary text-primary-foreground font-heading font-black flex items-center justify-center text-3xl mx-auto mb-4"
				>
					L
				</div>
				<h1 class="font-heading font-black text-2xl tracking-tight uppercase mb-2">
					Welcome Back
				</h1>
				<p class="font-mono text-xs text-text-muted tracking-widest uppercase">
					Sign in to your trading journal
				</p>
			</div>

			<!-- Form -->
			<form @submit.prevent="handleLogin" class="space-y-4">
				<!-- Error Message -->
				<div
					v-if="error"
					class="px-4 py-3 bg-danger/20 text-danger text-xs font-mono tracking-wider uppercase rounded border border-danger/30"
				>
					{{ error }}
				</div>

				<!-- Username -->
				<div class="flex flex-col gap-1.5">
					<label
						for="username"
						class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
					>
						Username
					</label>
					<input
						id="username"
						v-model="username"
						type="text"
						placeholder="Enter your username"
						autocomplete="username"
						class="bg-transparent border border-border px-4 py-3 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
						@input="error = ''"
					/>
				</div>

				<!-- Password -->
				<div class="flex flex-col gap-1.5">
					<label
						for="password"
						class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
					>
						Password
					</label>
					<input
						id="password"
						v-model="password"
						type="password"
						placeholder="Enter your password"
						autocomplete="current-password"
						class="bg-transparent border border-border px-4 py-3 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors duration-100"
						@input="error = ''"
					/>
				</div>

				<!-- Submit Button -->
				<button
					type="submit"
					:disabled="isLoading || !username || !password"
					:class="[
						'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
						isLoading || !username || !password
							? 'bg-border text-text-muted cursor-not-allowed'
							: 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px',
					]"
				>
					<template v-if="isLoading">Signing in...</template>
					<template v-else>Sign In</template>
				</button>
			</form>

			<!-- Divider -->
			<div class="flex items-center gap-4 my-6">
				<div class="flex-1 h-px bg-border"></div>
				<span class="font-mono text-[10px] text-text-muted tracking-widest uppercase">
					or continue with
				</span>
				<div class="flex-1 h-px bg-border"></div>
			</div>

			<!-- Social Login Buttons -->
			<div class="flex justify-center">
				<button
					@click="handleSocialLogin('google')"
					class="flex items-center justify-center gap-2 px-4 py-3 border border-border bg-surface/40 hover:bg-surface-hover/60 transition-colors"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24">
						<path
							fill="currentColor"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="currentColor"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="currentColor"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						/>
						<path
							fill="currentColor"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
					<span class="font-mono text-xs tracking-wider uppercase">Sign in with Google</span>
				</button>
			</div>

			<!-- Register Link -->
			<p class="text-center mt-8 font-mono text-xs text-text-muted">
				Don't have an account?
				<button @click="goToRegister" class="text-primary hover:underline font-bold">
					Sign up
				</button>
			</p>
		</div>
	</div>
</template>
