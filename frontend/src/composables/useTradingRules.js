import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import apiFetch from '../utils/api';

const apiUrl = import.meta.env.VITE_API_BASE_URL;

export function useTradingRules() {
	const queryClient = useQueryClient();

	const { data: tradingRules, isLoading, isError } = useQuery({
		queryKey: ['trading-rules'],
		queryFn: async () => {
			const response = await apiFetch(`${apiUrl}/api/trading-rules`, {
				method: 'GET',
				credentials: 'include',
			});

			return response;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	const createTradingRuleMutation = useMutation({
		mutationFn: async (ruleData) => {
			const response = await apiFetch(`${apiUrl}/api/trading-rules`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(ruleData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['trading-rules']);
		},
	});

	const updateTradingRuleMutation = useMutation({
		mutationFn: async ({ id, ...ruleData }) => {
			const response = await apiFetch(`${apiUrl}/api/trading-rules/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(ruleData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['trading-rules']);
		},
	});

	const deleteTradingRuleMutation = useMutation({
		mutationFn: async (id) => {
			await apiFetch(`${apiUrl}/api/trading-rules/${id}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['trading-rules']);
		},
	});

	return {
		tradingRules,
		isLoading,
		isError,
		createTradingRule: createTradingRuleMutation.mutate,
		updateTradingRule: updateTradingRuleMutation.mutate,
		deleteTradingRule: deleteTradingRuleMutation.mutate,
	};
}
