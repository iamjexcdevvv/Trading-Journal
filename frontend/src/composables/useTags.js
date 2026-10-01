import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import apiFetch from '../utils/api';
import { apiBaseUrl } from '../config/urls.js';

const apiUrl = apiBaseUrl;

export function useTags() {
	const queryClient = useQueryClient();

	// Fetch tags
	const { data: tags, isLoading, isError } = useQuery({
		queryKey: ['tags'],
		queryFn: async () => {
			const response = await apiFetch(`${apiUrl}/api/tags`, {
				method: 'GET',
				credentials: 'include',
			});

			return response;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	// Create tag
	const createTagMutation = useMutation({
		mutationFn: async (tagData) => {
			const response = await apiFetch(`${apiUrl}/api/tags`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(tagData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['tags']);
		},
	});

	// Update tag
	const updateTagMutation = useMutation({
		mutationFn: async ({ id, ...tagData }) => {
			const response = await apiFetch(`${apiUrl}/api/tags/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(tagData),
			});

			return response;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['tags']);
		},
	});

	// Delete tag
	const deleteTagMutation = useMutation({
		mutationFn: async (id) => {
			await apiFetch(`${apiUrl}/api/tags/${id}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries(['tags']);
		},
	});

	// Get tag names array for form usage
	const tagNames = computed(() => {
		if (!tags.value) return [];
		return tags.value.map(tag => tag.name);
	});

	return {
		tags,
		tagNames,
		isLoading,
		isError,
		createTag: createTagMutation.mutate,
		updateTag: updateTagMutation.mutate,
		deleteTag: deleteTagMutation.mutate,
	};
}
