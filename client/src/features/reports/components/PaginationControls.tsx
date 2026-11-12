interface PaginationControlsProps {
  label: string
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export default function PaginationControls({
  label,
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationControlsProps) {
  if (totalItems === 0) {
    return null
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  const startItem = (safePage - 1) * pageSize + 1
  const endItem = Math.min(safePage * pageSize, totalItems)

  return (
    <div
      aria-label={`${label} pagination`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs text-slate-600"
    >
      <span>
        Showing {startItem}–{endItem} of {totalItems} (Page {safePage} of{' '}
        {totalPages})
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label={`Previous ${label} page`}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label={`Next ${label} page`}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          Next
        </button>
      </div>
    </div>
  )
}

