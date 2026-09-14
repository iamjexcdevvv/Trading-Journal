import { ref, computed } from "vue";

const token = ref(null);

function decodeTokenPayload(value) {
	if (!value) return null;

	try {
		const encoded = value.split(".")[1];
		const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
		const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return null;
	}
}

export function useAuth() {
	const setToken = (newToken) => {
		token.value = newToken;
	};

	const logout = () => {
		token.value = null;
	};

	const isLoggedIn = computed(() => !!token.value);
	const user = computed(() => {
		const payload = decodeTokenPayload(token.value);
		const displayName = payload?.username || payload?.email?.split("@")[0] || "Trader";
		const initials = displayName
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join("") || "TR";

		return {
			id: payload?._id || null,
			displayName,
			email: payload?.email || "",
			initials,
		};
	});

	return {
		token,
		setToken,
		logout,
		isLoggedIn,
		user,
	};
}
