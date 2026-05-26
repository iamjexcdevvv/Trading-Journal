<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth.js";

const apiURL = import.meta.env.VITE_API_BASE_URL;

const router = useRouter();
const { setToken } = useAuth();

const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const isLoading = ref(false);
const error = ref("");

const usernameError = computed(() => {
	if (!username.value) return "";
	if (username.value.length < 3) return "Username must be at least 3 characters";
	return "";
});

const passwordError = computed(() => {
	if (!password.value) return "";
	if (password.value.length < 6) return "Password must be at least 6 characters";
	return "";
});

const confirmPasswordError = computed(() => {
	if (!confirmPassword.value) return "";
	if (confirmPassword.value !== password.value) return "Passwords do not match";
	return "";
});

const isValid = computed(() => {
	return (
		username.value.length >= 3 &&
		password.value.length >= 6 &&
		confirmPassword.value === password.value
	);
});

const handleRegister = async () => {
	error.value = "";

	if (username.value.length < 3) {
		error.value = "Username must be at least 3 characters";
		return;
	}

	if (password.value.length < 6) {
		error.value = "Password must be at least 6 characters";
		return;
	}

	if (password.value !== confirmPassword.value) {
		error.value = "Passwords do not match";
		return;
	}

	isLoading.value = true;

	try {
		const response = await fetch(`${apiURL}/api/auth/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: 'include',
			body: JSON.stringify({
				username: username.value,
				password: password.value,
			}),
		});

		if (!response.ok) {
			const data = await response.json();
			console.log(data)
			throw new Error(data.message || "Registration failed");
		}

		const data = await response.json();

		// Store token and user data
		setToken(data.accessToken);

		// Registration successful, redirect to main app
		router.push("/");
	} catch (err) {
		error.value = err.message;
	} finally {
		isLoading.value = false;
	}
};

const handleSocialLogin = (provider) => {
	// TODO: Implement social login logic
	console.log(`Register with ${provider}`);
};

const goToLogin = () => {
	router.push("/login");
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
					Create Account
				</h1>
				<p class="font-mono text-xs text-text-muted tracking-widest uppercase">
					Start tracking your trades today
				</p>
			</div>

			<!-- Form -->
			<form @submit.prevent="handleRegister" class="space-y-4">
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
						placeholder="Choose a username"
						autocomplete="username"
						:class="[
							'bg-transparent border px-4 py-3 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-1 transition-colors duration-100',
							usernameError
								? 'border-danger focus:border-danger focus:ring-danger'
								: 'border-border focus:border-primary focus:ring-primary',
						]"
					/>
					<span
						v-if="usernameError"
						class="text-[10px] text-danger font-mono tracking-wider uppercase"
					>
						{{ usernameError }}
					</span>
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
						placeholder="Create a password"
						autocomplete="new-password"
						:class="[
							'bg-transparent border px-4 py-3 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-1 transition-colors duration-100',
							passwordError
								? 'border-danger focus:border-danger focus:ring-danger'
								: 'border-border focus:border-primary focus:ring-primary',
						]"
					/>
					<span
						v-if="passwordError"
						class="text-[10px] text-danger font-mono tracking-wider uppercase"
					>
						{{ passwordError }}
					</span>
				</div>

				<!-- Confirm Password -->
				<div class="flex flex-col gap-1.5">
					<label
						for="confirmPassword"
						class="font-mono text-[10px] tracking-widest uppercase text-text-muted"
					>
						Confirm Password
					</label>
					<input
						id="confirmPassword"
						v-model="confirmPassword"
						type="password"
						placeholder="Confirm your password"
						autocomplete="new-password"
						:class="[
							'bg-transparent border px-4 py-3 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-1 transition-colors duration-100',
							confirmPasswordError
								? 'border-danger focus:border-danger focus:ring-danger'
								: 'border-border focus:border-primary focus:ring-primary',
						]"
					/>
					<span
						v-if="confirmPasswordError"
						class="text-[10px] text-danger font-mono tracking-wider uppercase"
					>
						{{ confirmPasswordError }}
					</span>
				</div>

				<!-- Submit Button -->
				<button
					type="submit"
					:disabled="isLoading || !isValid"
					:class="[
						'w-full py-3 font-heading font-bold text-sm tracking-widest uppercase transition-all duration-100',
						isLoading || !isValid
							? 'bg-border text-text-muted cursor-not-allowed'
							: 'bg-primary text-primary-foreground hover:brightness-110 active:translate-y-px',
					]"
				>
					<template v-if="isLoading">Creating account...</template>
					<template v-else>Sign Up</template>
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
			<div class="grid grid-cols-3 gap-3">
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
				</button>
				<button
					@click="handleSocialLogin('facebook')"
					class="flex items-center justify-center gap-2 px-4 py-3 border border-border bg-surface/40 hover:bg-surface-hover/60 transition-colors"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
						/>
					</svg>
				</button>
				<button
					@click="handleSocialLogin('github')"
					class="flex items-center justify-center gap-2 px-4 py-3 border border-border bg-surface/40 hover:bg-surface-hover/60 transition-colors"
				>
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
						/>
					</svg>
				</button>
			</div>

			<!-- Login Link -->
			<p class="text-center mt-8 font-mono text-xs text-text-muted">
				Already have an account?
				<button @click="goToLogin" class="text-primary hover:underline font-bold">
					Sign in
				</button>
			</p>
		</div>
	</div>
</template>
