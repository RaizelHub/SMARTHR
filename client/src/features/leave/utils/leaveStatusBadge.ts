import type { LeaveRequestStatus } from '../../../types/leave'

export function getLeaveStatusBadgeClasses(status: LeaveRequestStatus): string {
  const base =
    'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium'
  switch (status) {
    case 'Pending':
      return `${base} border-amber-200 bg-amber-50 text-amber-800`
    case 'Approved':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`
    case 'Rejected':
      return `${base} border-red-200 bg-red-50 text-red-800`
    case 'Cancelled':
      return `${base} border-slate-300 bg-slate-100 text-slate-700`
  }
}

