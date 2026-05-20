"use client"

import { useState, useEffect } from "react"
import { useI18n } from "../hooks/useI18n"
import backgroundSyncService from "../services/backgroundSyncService"

export default function OfflineBanner() {
  const { t } = useI18n()
  const initial = backgroundSyncService.getStatus()
  const [isOnline, setIsOnline] = useState(initial.isOnline)
  const [pendingCount, setPendingCount] = useState(initial.pendingUpdates)
  const [isSyncingInvoices, setIsSyncingInvoices] = useState(initial.isSyncingInvoices)
  const [lastSyncError, setLastSyncError] = useState(initial.lastSyncError)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const handleSyncStatus = (status: any) => {
      setIsOnline(status.isOnline)
      setPendingCount(status.pendingUpdates)
      setIsSyncingInvoices(status.isSyncingInvoices ?? false)
      setLastSyncError(status.lastSyncError ?? null)
    }
    backgroundSyncService.on('status_change', handleSyncStatus)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      backgroundSyncService.off('status_change', handleSyncStatus)
    }
  }, [])

  if (isOnline && pendingCount === 0) return null

  const handleRetry = () => {
    backgroundSyncService.syncOfflineInvoices()
  }

  if (isOnline && pendingCount > 0) {
    return (
      <div className="border-l-4 px-4 py-2 bg-blue-50 border-blue-400">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="h-4 w-4 flex-shrink-0 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-medium text-blue-700">
              {isSyncingInvoices
                ? `Syncing ${pendingCount} pending invoice${pendingCount !== 1 ? 's' : ''}…`
                : lastSyncError
                ? `${pendingCount} invoice${pendingCount !== 1 ? 's' : ''} failed to sync — ${lastSyncError}`
                : `${pendingCount} invoice${pendingCount !== 1 ? 's' : ''} pending sync`}
            </p>
          </div>
          {!isSyncingInvoices && (
            <button
              onClick={handleRetry}
              className="ml-4 text-xs font-semibold text-blue-700 underline hover:text-blue-900"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border-l-4 px-4 py-2 bg-yellow-100 border-yellow-500">
      <div className="flex items-center space-x-2">
        <svg className="h-4 w-4 flex-shrink-0 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <p className="text-sm font-medium text-yellow-700">
          {t("OFFLINE_MESSAGE") || "You are offline. Sales will be saved and synced when connection is restored."}
        </p>
      </div>
    </div>
  )
}
