import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import apiFetch from '../utils/api';
import { apiBaseUrl } from '../config/urls.js';

const apiUrl = apiBaseUrl;

export function useAlerts() {
	const queryClient = useQueryClient();

	// Fetch alerts
	const { data: alerts, isLoading, isError } = useQuery({
		queryKey: ['alerts'],
		queryFn: async () => {
			const response = await apiFetch(`${apiUrl}/api/alerts`, {
				method: 'GET',
				credentials: 'include',
			});

			return response;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	// Create alert
	const createAlertMutation = useMutation({
		mutationFn: async (alertData) => {
			const response = await apiFetch(`${apiUrl}/api/alerts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(alertData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['alerts']);
		},
	});

	// Delete alert
	const deleteAlertMutation = useMutation({
		mutationFn: async (id) => {
			const response = await apiFetch(`${apiUrl}/api/alerts/${id}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			console.log(response);

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['alerts']);
		},
	});

	return {
		alerts,
		isLoading,
		isError,
		createAlert: createAlertMutation.mutate,
		createAlertAsync: createAlertMutation.mutateAsync,
		deleteAlert: deleteAlertMutation.mutate,
		deleteAlertAsync: deleteAlertMutation.mutateAsync,
	};
}
