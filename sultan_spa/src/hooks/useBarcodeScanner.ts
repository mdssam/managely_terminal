import { useState } from 'react'
import { useProducts } from './useProducts'
import type { MenuItem } from '../../types'

interface UseBarcodeScannerReturn {
  scanBarcode: (barcode: string) => Promise<boolean>
  isScanning: boolean
  error: string | null
  clearError: () => void
}

export function useBarcodeScanner(onAddToCart: (item: MenuItem, quantity?: number) => void): UseBarcodeScannerReturn {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { products } = useProducts()

  const clearError = () => setError(null)

  const scanBarcode = async (barcode: string): Promise<boolean> => {
    if (!barcode.trim()) {
      setError('Please enter a valid barcode')
      return false
    }

    setIsScanning(true)
    setError(null)

    try {
      console.log('Starting scan logic for:', barcode)

      // IF barcode is composite (|), force skip local search to engage server-side deconstructor directly
      if (barcode.includes('|')) {
        console.log('Composite barcode detected - bypassing local cache searching to hit API...')
      } else {
        // First try to find by barcode in the products list
        const foundItem = products.find(item => {
          const idStr = String(item.id || '').toLowerCase()
          const nameStr = String(item.name || '').toLowerCase()
          const checkStr = barcode.toLowerCase()
          
          return idStr === checkStr || nameStr.includes(checkStr)
        })

        if (foundItem) {
          console.log('Locally resolved item:', foundItem.name)
          onAddToCart(foundItem)
          return true
        }
      }

      // If not found in local products, try API call
      try {
        console.log('Dispatching API request for identifier:', barcode)
        // First try combined identifier endpoint (barcode/batch/serial)
        const response = await fetch(`/api/method/sultan.sultan.api.item.get_item_by_identifier?code=${encodeURIComponent(barcode)}`)
        console.log('API response received. Status:', response.status)
        
        const data = await response.json()
        console.log('API parsed data payload:', data)

        if (data.message && data.message.item_code) {
          console.log('Success! Item resolved:', data.message.item_code)
          // Convert API response to MenuItem format
          const item = {
            id: data.message.item_code,
            name: data.message.item_name || data.message.item_code,
            category: data.message.item_group || 'General',
            price: data.message.price || 0,
            available: data.message.available || 0,
            image: data.message.image,
            uom: data.message.uom || data.message.stock_uom,
            stock_uom: data.message.stock_uom,
            conversion_factor: data.message.conversion_factor,
            sold: 0
          }
          // Add to cart, optionally providing returned weight/quantity
          console.log('Executing onAddToCart for weight:', data.message.weight || 1)
          onAddToCart(item, data.message.weight || 1)
          return true
        } else {
          console.warn('API responded but lacked item_code in payload.', data)
          setError('Product not found for this barcode')
          return false
        }
      } catch (apiError) {
        console.error('CRITICAL API EXCEPTION TRAPPED:', apiError)
        setError('Product not found for this barcode')
        return false
      }
    } catch (err) {
      console.error('TOP-LEVEL SCAN EXCEPTION:', err)
      setError('Error processing barcode')
      return false
    } finally {
      setIsScanning(false)
      console.log('Scan transaction finalized.')
    }
  }

  return {
    scanBarcode,
    isScanning,
    error,
    clearError
  }
}
