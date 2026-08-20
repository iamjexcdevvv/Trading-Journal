import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import apiFetch from '../utils/api';

const apiUrl = import.meta.env.VITE_API_BASE_URL;

export function useExchangeConnections() {
	const queryClient = useQueryClient();

	// Fetch connections
	const { data: connections, isLoading, isError } = useQuery({
		queryKey: ['connections'],
		queryFn: async () => {
			const response = await apiFetch(`${apiUrl}/api/connections`, {
				method: 'GET',
				credentials: 'include',
			});

			return response;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	// Create connection
	const createConnectionMutation = useMutation({
		mutationFn: async (connectionData) => {
			const response = await apiFetch(`${apiUrl}/api/connections`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(connectionData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['connections']);
		},
	});

	// Delete connection
	const deleteConnectionMutation = useMutation({
		mutationFn: async (id) => {
			const response = await apiFetch(`${apiUrl}/api/connections/${id}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['connections']);
		},
	});

	// Trigger a manual sync
	const syncNowMutation = useMutation({
		mutationFn: async (id) => {
			const response = await apiFetch(`${apiUrl}/api/connections/${id}/sync`, {
				method: 'POST',
				credentials: 'include',
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['connections']);
			queryClient.invalidateQueries(['trades']);
		},
	});

	return {
		connections,
		isLoading,
		isError,
		createConnection: createConnectionMutation.mutate,
		createConnectionAsync: createConnectionMutation.mutateAsync,
		createConnectionError: createConnectionMutation.error,
		isCreatingConnection: createConnectionMutation.isPending,
		deleteConnection: deleteConnectionMutation.mutate,
		deleteConnectionAsync: deleteConnectionMutation.mutateAsync,
		syncNow: syncNowMutation.mutate,
		syncNowAsync: syncNowMutation.mutateAsync,
		isSyncing: syncNowMutation.isPending,
	};
}
