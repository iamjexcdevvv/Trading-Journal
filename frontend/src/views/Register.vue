<script setup>
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { apiBaseUrl } from "../config/urls.js";

const apiURL = apiBaseUrl;

const router = useRouter();
const email = ref("");
const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const isLoading = ref(false);
const error = ref("");
const submitted = ref(false);

const emailError = computed(() => {
	if (!email.value) return "";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) return "Enter a valid email address";
	return "";
});

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
		!emailError.value && email.value.length > 0 &&
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
			credentials: "include",
			body: JSON.stringify({
				email: email.value,
				username: username.value,
				password: password.value,
			}),
		});

		if (!response.ok) {
			const data = await response.json();
			throw new Error(data.error || data.message || "Registration failed");
		}

		await response.json();
		submitted.value = true;
	} catch (err) {
		error.value = err.message;
	} finally {
		isLoading.value = false;
	}
};

const handleSocialLogin = (provider) => {
	window.location.href = `${apiURL}/api/auth/${provider}`;
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
			<div v-if="submitted" class="px-5 py-6 border border-success/30 bg-success/10 text-center rounded-lg">
				<h2 class="font-heading font-bold text-lg text-success">Approval requested</h2>
				<p class="mt-2 text-sm text-text-muted">Administrator must approve your account before you can sign in.</p>
				<button class="mt-5 px-5 py-2 bg-primary text-primary-foreground font-bold" @click="goToLogin">Return to sign in</button>
			</div>

			<form v-else @submit.prevent="handleRegister" class="space-y-4">
				<!-- Error Message -->
				<div
					v-if="error"
					class="px-4 py-3 bg-danger/20 text-danger text-xs font-mono tracking-wider uppercase rounded border border-danger/30"
				>
					{{ error }}
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="email" class="font-mono text-[10px] tracking-widest uppercase text-text-muted">Email</label>
					<input id="email" v-model.trim="email" type="email" placeholder="you@example.com" autocomplete="email" :class="['bg-transparent border px-4 py-3 font-sans text-sm text-text-main placeholder:text-text-muted/50 focus:outline-none focus:ring-1', emailError ? 'border-danger focus:ring-danger' : 'border-border focus:border-primary focus:ring-primary']" />
					<span v-if="emailError" class="text-[10px] text-danger font-mono tracking-wider uppercase">{{ emailError }}</span>
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
					<span class="font-mono text-xs tracking-wider uppercase">Sign up with Google</span>
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
