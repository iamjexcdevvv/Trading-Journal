import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import apiFetch from '../utils/api';
import { apiBaseUrl } from '../config/urls.js';

const apiUrl = apiBaseUrl;

export function useSetups() {
	const queryClient = useQueryClient();

	// Fetch setups
	const { data: setups, isLoading, isError } = useQuery({
		queryKey: ['setups'],
		queryFn: async () => {
			const response = await apiFetch(`${apiUrl}/api/setups`, {
				method: 'GET',
				credentials: 'include',
			});

			return response;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	// Create setup
	const createSetupMutation = useMutation({
		mutationFn: async (setupData) => {
			const response = await apiFetch(`${apiUrl}/api/setups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(setupData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['setups']);
		},
	});

	// Update setup
	const updateSetupMutation = useMutation({
		mutationFn: async ({ id, ...setupData }) => {
			const response = await apiFetch(`${apiUrl}/api/setups/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(setupData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['setups']);
		},
	});

	// Delete setup
	const deleteSetupMutation = useMutation({
		mutationFn: async (id) => {
			await apiFetch(`${apiUrl}/api/setups/${id}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['setups']);
		},
	});

	return {
		setups,
		isLoading,
		isError,
		createSetup: createSetupMutation.mutate,
		updateSetup: updateSetupMutation.mutate,
		deleteSetup: deleteSetupMutation.mutate,
	};
}
