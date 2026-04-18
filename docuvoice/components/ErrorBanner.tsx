'use client'

interface ErrorBannerProps {
  message: string
  onDismiss?: () => void
  onRetry?: () => void
}

export default function ErrorBanner({ message, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-200"
    >
      {/* Icon */}
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>

      {/* Message */}
      <span className="flex-1">{message}</span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="min-h-[44px] min-w-[44px] rounded px-3 py-1 text-xs font-medium text-red-300 underline-offset-2 hover:text-red-100 hover:underline focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss error"
            className="min-h-[44px] min-w-[44px] rounded p-1 text-red-400 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
