<script setup>
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Check, Clock3, UserCheck } from "lucide-vue-next";
import apiFetch from "../utils/api.js";

const apiUrl = import.meta.env.VITE_API_BASE_URL;
const queryClient = useQueryClient();
const { data: pendingUsers, isLoading, isError } = useQuery({
	queryKey: ["admin-approvals"],
	queryFn: () => apiFetch(`${apiUrl}/api/admin/approvals`, { credentials: "include" }),
});
const {
	mutate: approve,
	isPending: isApproving,
	variables: approvingId,
	error: approvalError,
} = useMutation({
	mutationFn: (id) => apiFetch(`${apiUrl}/api/admin/approvals/${id}/approve`, { method: "PATCH", credentials: "include" }),
	onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-approvals"] }),
});
</script>

<template>
	<div class="admin-page">
		<header class="admin-intro"><div><h2>Registration approvals</h2><p>Review new users before granting dashboard access.</p></div><span><UserCheck :size="16" /> Administrator</span></header>
		<div v-if="approvalError" class="admin-state error">{{ approvalError.message || 'Could not approve user.' }}</div>
		<div v-if="isLoading" class="admin-state">Loading approval requests…</div>
		<div v-else-if="isError" class="admin-state error">Could not load approval requests.</div>
		<div v-else-if="!pendingUsers?.length" class="admin-state"><Check :size="22" /><strong>No pending users</strong><span>All registration requests are handled.</span></div>
		<div v-else class="approval-list">
			<article v-for="account in pendingUsers" :key="account._id" class="approval-card">
				<div class="approval-avatar">{{ account.username?.slice(0, 2).toUpperCase() || 'U' }}</div>
				<div><strong>{{ account.username }}</strong><span>{{ account.email }}</span><small><Clock3 :size="12" /> Requested {{ account.createdAt ? new Date(account.createdAt).toLocaleString() : 'recently' }}</small></div>
				<button :disabled="isApproving" @click="approve(account._id)"><Check :size="15" /> {{ isApproving && approvingId === account._id ? 'Approving…' : 'Approve' }}</button>
			</article>
		</div>
	</div>
</template>
