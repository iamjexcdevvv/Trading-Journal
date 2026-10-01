import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import apiFetch from '../utils/api.js';
import { useAuth } from './useAuth.js';
import { apiBaseUrl } from '../config/urls.js';

const apiUrl = apiBaseUrl;

export function useChartDrawings() {
	const queryClient = useQueryClient();
	const { isLoggedIn } = useAuth();
	const query = useQuery({ queryKey: ['chart-drawings'], enabled: isLoggedIn, queryFn: () => apiFetch(`${apiUrl}/api/chart-drawings`, { credentials: 'include' }), staleTime: 60_000 });
	const refresh = () => queryClient.invalidateQueries({ queryKey: ['chart-drawings'] });
	const create = useMutation({ mutationFn: (drawing) => apiFetch(`${apiUrl}/api/chart-drawings`, { method: 'POST', credentials: 'include', body: JSON.stringify(drawing) }), onSuccess: refresh });
	const update = useMutation({ mutationFn: ({ id, data }) => apiFetch(`${apiUrl}/api/chart-drawings/${id}`, { method: 'PATCH', credentials: 'include', body: JSON.stringify(data) }), onSuccess: refresh });
	const remove = useMutation({ mutationFn: ({ id, cascade = false }) => apiFetch(`${apiUrl}/api/chart-drawings/${id}${cascade ? '?cascade=true' : ''}`, { method: 'DELETE', credentials: 'include' }), onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: ['alerts'] }); } });
	return { drawings: query.data, isLoading: query.isLoading, createDrawingAsync: create.mutateAsync, updateDrawingAsync: update.mutateAsync, deleteDrawingAsync: remove.mutateAsync };
}
