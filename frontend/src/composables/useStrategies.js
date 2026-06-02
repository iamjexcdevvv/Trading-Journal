import { ref, computed } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';

const apiUrl = import.meta.env.VITE_API_BASE_URL;

export function useStrategies() {
	const queryClient = useQueryClient();

	// Fetch strategies
	const { data: strategies, isLoading, isError } = useQuery({
		queryKey: ['strategies'],
		queryFn: async () => {
			const response = await fetch(`${apiUrl}/api/strategies`, {
				method: 'GET',
				credentials: 'include',
			});

			if (!response.ok) {
				throw new Error('Failed to fetch strategies');
			}

			return response.json();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	// Create strategy
	const createStrategyMutation = useMutation({
		mutationFn: async (strategyData) => {
			const response = await fetch(`${apiUrl}/api/strategies`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(strategyData),
			});

			if (!response.ok) {
				throw new Error('Failed to create strategy');
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['strategies']);
		},
	});

	// Update strategy
	const updateStrategyMutation = useMutation({
		mutationFn: async ({ id, ...strategyData }) => {
			const response = await fetch(`${apiUrl}/api/strategies/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(strategyData),
			});

			if (!response.ok) {
				throw new Error('Failed to update strategy');
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['strategies']);
		},
	});

	// Delete strategy
	const deleteStrategyMutation = useMutation({
		mutationFn: async (id) => {
			const response = await fetch(`${apiUrl}/api/strategies/${id}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			if (!response.ok) {
				throw new Error('Failed to delete strategy');
			}

			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['strategies']);
		},
	});

	// Group strategies by direction
	const strategiesByDirection = computed(() => {
		if (!strategies.value) return { Long: [], Short: [] };

		return strategies.value.reduce((acc, strategy) => {
			if (!acc[strategy.direction]) {
				acc[strategy.direction] = [];
			}
			acc[strategy.direction].push(strategy.name);
			return acc;
		}, { Long: [], Short: [] });
	});

	return {
		strategies,
		strategiesByDirection,
		isLoading,
		isError,
		createStrategy: createStrategyMutation.mutate,
		updateStrategy: updateStrategyMutation.mutate,
		deleteStrategy: deleteStrategyMutation.mutate,
	};
}
