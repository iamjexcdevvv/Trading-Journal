import { ref, computed } from 'vue';

const token = ref(null);

export function useAuth() {
  const setToken = (newToken) => {
    token.value = newToken;
  };

  const logout = () => {
    token.value = null;
  };

  const isLoggedIn = computed(() => !!token.value);

  return {
    token,
    setToken,
    logout,
    isLoggedIn,
  };
}
