import { useState, useEffect } from "react";
import {
  X,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Package,
  Minus,
  Plus
} from "lucide-react";
import { toast } from "react-toastify";
import { formatCurrency, getCurrencySymbol } from "../utils/currency";
import { usePOSDetails } from "../hooks/usePOSProfile";
import { usePaymentModes } from "../hooks/usePaymentModes";
import { usePOSCurrencies } from "../hooks/usePOSCurrencies";
import { createPartialReturn, getReturnedQty, type ReturnItem } from "../services/returnService";
import { getInvoiceDetails } from "../services/salesInvoice";

interface SingleInvoiceReturnProps {
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (returnInvoice: string) => void;
}

export default function SingleInvoiceReturn({
  invoice,
  isOpen,
  onClose,
  onSuccess
}: SingleInvoiceReturnProps) {
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingReturnData, setLoadingReturnData] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [originalInvoiceGrandTotal, setOriginalInvoiceGrandTotal] = useState<number>(0);
  const [originalInvoicePaidAmount, setOriginalInvoicePaidAmount] = useState<number>(0);
  const [originalInvoiceNetTotal, setOriginalInvoiceNetTotal] = useState<number>(0);
  const [originalInvoiceTotalTaxes, setOriginalInvoiceTotalTaxes] = useState<number>(0);
  const [originalPayments, setOriginalPayments] = useState<any[]>([]);

  // Currency from invoice or POS profile
  const { posDetails } = usePOSDetails();
  const currencies = usePOSCurrencies();
  const currency = (invoice && (invoice.currency || invoice.company_currency)) || posDetails?.currency || '';
  const currencySymbol = getCurrencySymbol(currency);

  // Payment modes from POS profile
  const { modes: paymentModes, isLoading: paymentModesLoading } = usePaymentModes(typeof posDetails?.name === 'string' ? posDetails.name : '');

  // Payment method states
  const [returnAmount, setReturnAmount] = useState<number>(0);
  const [cashAmount, setCashAmount] = useState<string>("0.00");
  const [cashCurrency, setCashCurrency] = useState<string>("USD");
  const [cashRate, setCashRate] = useState<number>(1);
  const [bankAmount, setBankAmount] = useState<string>("0.00");
  const [bankCurrency, setBankCurrency] = useState<string>("USD");
  const [bankRate, setBankRate] = useState<number>(1);
  const [userHasSplit, setUserHasSplit] = useState<boolean>(false);

  const getExchangeRate = (curr: string): number => {
    if (!curr || curr === currencies.baseCurrency) return 1;
    const entry = currencies.secondaryCurrencies.find(e => e.currency === curr);
    return entry?.exchangeRate ?? currencies.exchangeRate ?? 1;
  };

  const toUSD = (amount: number, curr: string, rate: number): number => {
    if (!amount) return 0;
    if (curr === currencies.baseCurrency) return amount;
    return rate > 0 ? (rate > 1.0 ? amount / rate : amount * rate) : amount;
  };

  const fromUSD = (amountUSD: number, curr: string, rate: number): number => {
    if (!amountUSD) return 0;
    if (curr === currencies.baseCurrency) return amountUSD;
    return rate > 0 ? (rate > 1.0 ? amountUSD * rate : amountUSD / rate) : amountUSD;
  };

  const getSelectedCashMode = () => {
    const cashMethods = paymentModes.filter(m => m.type === "Cash");
    const match = cashMethods.find(m => (m.custom_currency || currencies.baseCurrency) === cashCurrency);
    return match?.mode_of_payment || cashMethods[0]?.mode_of_payment || "";
  };

  const getSelectedBankMode = () => {
    const bankMethods = paymentModes.filter(m => m.type === "Bank");
    const match = bankMethods.find(m => (m.custom_currency || currencies.baseCurrency) === bankCurrency);
    return match?.mode_of_payment || bankMethods[0]?.mode_of_payment || "";
  };

  const getCashUSD = () => {
    const amt = parseFloat(cashAmount) || 0;
    return toUSD(amt, cashCurrency, cashRate);
  };

  const getBankUSD = () => {
    const amt = parseFloat(bankAmount) || 0;
    return toUSD(amt, bankCurrency, bankRate);
  };

  const enteredUSDTotal = Math.round((getCashUSD() + getBankUSD()) * 100) / 100;

  const handleCashAmountChange = (valStr: string) => {
    setUserHasSplit(true);
    setCashAmount(valStr);
    const val = parseFloat(valStr) || 0;
    const usdVal = toUSD(val, cashCurrency, cashRate);
    const returnAmountUSD = toUSD(returnAmount, currency, getExchangeRate(currency));
    const remainingUSD = Math.max(0, returnAmountUSD - usdVal);
    const remainingBank = fromUSD(remainingUSD, bankCurrency, bankRate);
    setBankAmount(remainingBank > 0 ? (Math.round(remainingBank * 100) / 100).toString() : "0.00");
  };

  const handleBankAmountChange = (valStr: string) => {
    setUserHasSplit(true);
    setBankAmount(valStr);
    const val = parseFloat(valStr) || 0;
    const usdVal = toUSD(val, bankCurrency, bankRate);
    const returnAmountUSD = toUSD(returnAmount, currency, getExchangeRate(currency));
    const remainingUSD = Math.max(0, returnAmountUSD - usdVal);
    const remainingCash = fromUSD(remainingUSD, cashCurrency, cashRate);
    setCashAmount(remainingCash > 0 ? (Math.round(remainingCash * 100) / 100).toString() : "0.00");
  };

  const handleCashCurrencyChange = (newCurr: string) => {
    const prevRate = cashRate;
    const prevAmt = parseFloat(cashAmount) || 0;
    const usdVal = toUSD(prevAmt, cashCurrency, prevRate);
    
    const newRate = getExchangeRate(newCurr);
    
    setCashCurrency(newCurr);
    setCashRate(newRate);
    
    if (!userHasSplit) {
      const returnAmountUSD = toUSD(returnAmount, currency, getExchangeRate(currency));
      const newAmt = fromUSD(returnAmountUSD, newCurr, newRate);
      setCashAmount(newAmt > 0 ? (Math.round(newAmt * 100) / 100).toString() : "0.00");
    } else {
      const newAmt = fromUSD(usdVal, newCurr, newRate);
      setCashAmount(newAmt > 0 ? (Math.round(newAmt * 100) / 100).toString() : "0.00");
    }
  };

  const handleBankCurrencyChange = (newCurr: string) => {
    const prevRate = bankRate;
    const prevAmt = parseFloat(bankAmount) || 0;
    const usdVal = toUSD(prevAmt, bankCurrency, prevRate);
    
    const newRate = getExchangeRate(newCurr);
    
    setBankCurrency(newCurr);
    setBankRate(newRate);
    
    if (!userHasSplit) {
      const returnAmountUSD = toUSD(returnAmount, currency, getExchangeRate(currency));
      const newAmt = fromUSD(returnAmountUSD, newCurr, newRate);
      setBankAmount(newAmt > 0 ? (Math.round(newAmt * 100) / 100).toString() : "0.00");
    } else {
      const newAmt = fromUSD(usdVal, newCurr, newRate);
      setBankAmount(newAmt > 0 ? (Math.round(newAmt * 100) / 100).toString() : "0.00");
    }
  };

  const handleCashRateChange = (newRate: number) => {
    setCashRate(newRate);
    if (userHasSplit) {
      const val = parseFloat(cashAmount) || 0;
      const usdVal = toUSD(val, cashCurrency, newRate);
      const returnAmountUSD = toUSD(returnAmount, currency, getExchangeRate(currency));
      const remainingUSD = Math.max(0, returnAmountUSD - usdVal);
      const remainingBank = fromUSD(remainingUSD, bankCurrency, bankRate);
      setBankAmount(remainingBank > 0 ? (Math.round(remainingBank * 100) / 100).toString() : "0.00");
    }
  };

  const handleBankRateChange = (newRate: number) => {
    setBankRate(newRate);
    if (userHasSplit) {
      const val = parseFloat(bankAmount) || 0;
      const usdVal = toUSD(val, bankCurrency, newRate);
      const returnAmountUSD = toUSD(returnAmount, currency, getExchangeRate(currency));
      const remainingUSD = Math.max(0, returnAmountUSD - usdVal);
      const remainingCash = fromUSD(remainingUSD, cashCurrency, cashRate);
      setCashAmount(remainingCash > 0 ? (Math.round(remainingCash * 100) / 100).toString() : "0.00");
    }
  };

  // Reset split state when popup opens
  useEffect(() => {
    if (isOpen) {
      setUserHasSplit(false);
    }
  }, [isOpen]);

  // Initialize cash/bank currencies when payment modes are loaded
  useEffect(() => {
    if (paymentModes.length > 0) {
      const cashMethods = paymentModes.filter(m => m.type === "Cash");
      const bankMethods = paymentModes.filter(m => m.type === "Bank");

      const defaultCash = cashMethods.find(m => m.default === 1) || cashMethods[0];
      const defaultBank = bankMethods.find(m => m.default === 1) || bankMethods[0];

      if (defaultCash) {
        const curr = defaultCash.custom_currency || currencies.baseCurrency;
        setCashCurrency(curr);
        setCashRate(getExchangeRate(curr));
      }
      if (defaultBank) {
        const curr = defaultBank.custom_currency || currencies.baseCurrency;
        setBankCurrency(curr);
        setBankRate(getExchangeRate(curr));
      }
    }
  }, [paymentModes, currencies]);

  // Distribute returnAmount to Cash or Bank based on original payment details
  useEffect(() => {
    if (returnAmount > 0 && !userHasSplit) {
      const cashOriginal = originalPayments.filter(p => {
        const mode = paymentModes.find(m => m.mode_of_payment === p.mode_of_payment);
        return mode?.type === "Cash";
      });
      const bankOriginal = originalPayments.filter(p => {
        const mode = paymentModes.find(m => m.mode_of_payment === p.mode_of_payment);
        return mode?.type === "Bank";
      });

      const totalCashPaid = cashOriginal.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      const totalBankPaid = bankOriginal.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      const returnAmountUSD = toUSD(returnAmount, currency, getExchangeRate(currency));

      if (totalCashPaid >= totalBankPaid) {
        const rate = getExchangeRate(cashCurrency);
        const displayAmt = fromUSD(returnAmountUSD, cashCurrency, rate);
        setCashAmount((Math.round(displayAmt * 100) / 100).toString());
        setBankAmount("0.00");
      } else {
        const rate = getExchangeRate(bankCurrency);
        const displayAmt = fromUSD(returnAmountUSD, bankCurrency, rate);
        setBankAmount((Math.round(displayAmt * 100) / 100).toString());
        setCashAmount("0.00");
      }
    } else if (returnAmount === 0) {
      setCashAmount("0.00");
      setBankAmount("0.00");
    }
  }, [returnAmount, originalPayments, paymentModes, userHasSplit, cashCurrency, bankCurrency, currency, cashRate, bankRate]);

  useEffect(() => {
    if (isOpen && invoice) {
      initializeReturnItems();
    }
  }, [isOpen, invoice]);

  // Update return amount when items change (always in base/USD currency)
  useEffect(() => {
    const taxFactor = originalInvoiceNetTotal > 0
      ? (1 + originalInvoiceTotalTaxes / originalInvoiceNetTotal)
      : (originalInvoiceGrandTotal > 0 && originalInvoiceNetTotal > 0
         ? originalInvoiceGrandTotal / originalInvoiceNetTotal
         : 1);

    if (originalInvoicePaidAmount > 0) {
      // Check if we should ignore writeoff on partial returns
      const ignoreWriteoffOnPartialReturns = posDetails?.custom_ignore_write_off_on_partial_returns || false;

      // Calculate return amount based on percentage of items being returned
      const totalItemsAmount = returnItems.reduce((sum, item) => {
        return sum + (item.qty * item.rate);
      }, 0);

      const returnedItemsAmount = returnItems.reduce((sum, item) => {
        return sum + ((item.return_qty || 0) * item.rate);
      }, 0);

      // Check if this is a partial return (not all items are being returned)
      const isPartialReturn = returnedItemsAmount < totalItemsAmount;

      let calculatedReturnAmount;

      if (ignoreWriteoffOnPartialReturns && isPartialReturn) {
        // For partial returns when checkbox is ticked: ignore writeoff, use original item rates scaled by tax factor
        calculatedReturnAmount = returnedItemsAmount * taxFactor;
      } else {
        // Original logic: Calculate percentage of items being returned
        const returnPercentage = totalItemsAmount > 0 ? returnedItemsAmount / totalItemsAmount : 0;
        // Apply the same percentage to the original paid amount (what customer actually paid)
        calculatedReturnAmount = originalInvoicePaidAmount * returnPercentage;
      }

      // Round to 2 decimal places to avoid floating point precision issues
      setReturnAmount(Math.round(calculatedReturnAmount * 100) / 100);
    } else {
      // Fallback to item-based calculation if paid amount is not available
      const total = returnItems.reduce((sum, item) => {
        return sum + ((item.return_qty || 0) * item.rate);
      }, 0);
      setReturnAmount(Math.round(total * taxFactor * 100) / 100);
    }
  }, [returnItems, originalInvoicePaidAmount, originalInvoiceNetTotal, originalInvoiceTotalTaxes, originalInvoiceGrandTotal, posDetails?.custom_ignore_write_off_on_partial_returns]);



  const initializeReturnItems = async () => {
    setLoadingReturnData(true);
    try {

      // Always fetch complete invoice details from backend to get accurate grand_total
      let invoiceWithItems = invoice;
      const invoiceDetails = await getInvoiceDetails(invoice.name || invoice.id);

      if (invoiceDetails.success && invoiceDetails.data) {
        invoiceWithItems = invoiceDetails.data.data || invoiceDetails.data;
        // Store the original payments
        setOriginalPayments(invoiceWithItems.payments || []);
        // Store the original invoice grand total and paid amount for return calculations
        setOriginalInvoiceGrandTotal(invoiceWithItems.grand_total || 0);
        setOriginalInvoicePaidAmount(invoiceWithItems.paid_amount || invoiceWithItems.grand_total || 0);
        setOriginalInvoiceNetTotal(invoiceWithItems.net_total || 0);
        setOriginalInvoiceTotalTaxes(invoiceWithItems.total_taxes_and_charges || 0);
      } else {
        console.error('Failed to fetch invoice details:', invoiceDetails.error);
        throw new Error(invoiceDetails.error || 'Failed to fetch invoice details from backend');
      }

        const items: ReturnItem[] = [];

        // Handle different possible item structures
        const itemsArray = invoiceWithItems.items || invoiceWithItems.items_list || invoiceWithItems.sales_invoice_items || [];

        if (!Array.isArray(itemsArray)) {
          console.error('Items is not an array:', itemsArray);
          throw new Error('Invoice items not found in expected format');
        }

        for (const item of itemsArray) {

        // Get returned quantity for each item
        const returnedData = await getReturnedQty(
          invoiceWithItems.customer,
          invoiceWithItems.name || invoiceWithItems.id,
          item.item_code || item.id
        );

        const returnedQty = returnedData.success ?
          returnedData.data?.total_returned_qty || 0 : 0;

        // Handle different property names from different invoice sources
        const itemCode = item.item_code || item.id;
        const itemName = item.item_name || item.name;
        const qty = Number(item.qty ?? item.quantity ?? 0);
        const rate = Number(item.rate ?? item.unitPrice ?? 0);
        const amount = Number(item.amount ?? item.total ?? (qty * rate));


        items.push({
          item_code: itemCode,
          item_name: itemName,
          qty,
          rate,
          amount,
          returned_qty: returnedQty,
          available_qty: Math.round((qty - returnedQty) * 100) / 100,  // Round to 2 decimal places
          return_qty: Math.round((qty - returnedQty) * 100) / 100  // Round to 2 decimal places
        });
      }

      setReturnItems(items);
    } catch (error) {
      console.error('Error initializing return items:', error);
      toast.error('Failed to load return data');
    } finally {
      setLoadingReturnData(false);
    }
  };

  const handleReturnQtyChange = (itemCode: string, newQty: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.item_code === itemCode) {
        // Ensure return qty doesn't exceed available qty and round to 2 decimal places
        const validQty = Math.max(0, Math.min(Math.round(newQty * 100) / 100, item.available_qty));
        return { ...item, return_qty: validQty };
      }
      return item;
    }));
  };

  const handleReturnAllItems = () => {
    setReturnItems(prev => prev.map(item => ({
      ...item,
      return_qty: item.available_qty
    })));
  };

  const handleClearAll = () => {
    setReturnItems(prev => prev.map(item => ({
      ...item,
      return_qty: 0
    })));
  };

  const handleSubmitReturn = async () => {
    const itemsToReturn = returnItems.filter(item => item.return_qty && item.return_qty > 0);

    if (itemsToReturn.length === 0) {
      toast.error('Please select at least one item to return');
      return;
    }

    const cashVal = parseFloat(cashAmount) || 0;
    const bankVal = parseFloat(bankAmount) || 0;

    if (cashVal === 0 && bankVal === 0) {
      toast.error('Please enter a return amount for Cash or Bank');
      return;
    }

    const paymentsToSend = [];
    if (cashVal > 0) {
      const mode = getSelectedCashMode();
      const amountUSD = cashRate > 0 ? (cashRate > 1.0 ? cashVal / cashRate : cashVal * cashRate) : cashVal;
      paymentsToSend.push({
        mode_of_payment: mode,
        amount: Math.round(amountUSD * 100) / 100,
        currency: cashCurrency,
        original_amount: cashVal
      });
    }
    if (bankVal > 0) {
      const mode = getSelectedBankMode();
      const amountUSD = bankRate > 0 ? (bankRate > 1.0 ? bankVal / bankRate : bankVal * bankRate) : bankVal;
      paymentsToSend.push({
        mode_of_payment: mode,
        amount: Math.round(amountUSD * 100) / 100,
        currency: bankCurrency,
        original_amount: bankVal
      });
    }

    setIsLoading(true);
    const invoiceName = invoice.id || invoice.name;
    try {
      const result = await createPartialReturn(
        invoiceName,
        itemsToReturn,
        undefined,
        undefined,
        undefined,
        undefined,
        paymentsToSend
      );

      if (result.success) {
        toast.success(`Return created successfully`);
        onSuccess(result.returnInvoice!);
        onClose();
      } else {
        toast.error(result.error || 'Failed to create return');
      }
    } catch (error) {
      console.error('Error creating return:', error);
      toast.error('Failed to create return');
    } finally {
      setIsLoading(false);
    }
  };

  const totalReturnAmountNet = returnItems.reduce(
    (sum, item) => sum + (item.return_qty || 0) * item.rate,
    0
  );

  const taxFactor = originalInvoiceNetTotal > 0
    ? (1 + originalInvoiceTotalTaxes / originalInvoiceNetTotal)
    : (originalInvoiceGrandTotal > 0 && originalInvoiceNetTotal > 0
       ? originalInvoiceGrandTotal / originalInvoiceNetTotal
       : 1);

  const totalReturnAmount = Math.round(totalReturnAmountNet * taxFactor * 100) / 100;

  const enteredRefundInvoiceCurrency = fromUSD(enteredUSDTotal, currency, getExchangeRate(currency));
  const totalReturnAmountUSD = toUSD(totalReturnAmount, currency, getExchangeRate(currency));
  const hasWriteOff = originalInvoicePaidAmount > 0 && Math.abs(totalReturnAmountUSD - enteredUSDTotal) > 0.01;

  const hasItemsToReturn = returnItems.some(item => (item.return_qty || 0) > 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-ziditech-100 dark:bg-orange-900/20 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
                <RotateCcw className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Return Items
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Invoice: {invoice?.name || invoice?.id} • Customer: {invoice?.customer}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingReturnData ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading return data...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Action Buttons */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleReturnAllItems}
                    className="px-4 py-2 bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/40 transition-colors text-sm font-medium"
                  >
                    Return All Available
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                  >
                    Clear All
                  </button>
                </div>
                <div className="text-right">
                  {hasWriteOff ? (
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      <div className="flex justify-between items-center">
                        <span>Expected Refund:</span>
                        <span className="font-semibold">{formatCurrency(totalReturnAmount, currency)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Entered Refund:</span>
                        <span className="font-semibold">{formatCurrency(enteredRefundInvoiceCurrency, currency)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-orange-600 dark:text-red-400 font-semibold">Write-off:</span>
                        <span className="text-orange-600 dark:text-red-400 font-semibold">
                          {formatCurrency(totalReturnAmount - enteredRefundInvoiceCurrency, currency)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-lg font-bold text-black-600 dark:text-orange-400">
                      {formatCurrency(totalReturnAmount, currency)}
                    </div>
                  )}
                  {originalInvoicePaidAmount > 0 && !hasWriteOff && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Customer Paid: {formatCurrency(originalInvoicePaidAmount, currency)}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-gray-600">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Item
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Sold Qty
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Returned
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Available
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Return Qty
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Unit Price
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Return Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {returnItems.map((item) => (
                        <tr key={item.item_code} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                          <td className="px-4 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                                <Package className="w-4 h-4 text-gray-900 dark:text-blue-400" />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {item.item_name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Code: {item.item_code}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center text-sm text-gray-900 dark:text-white">
                            {item.qty}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-sm text-red-600 dark:text-red-400">
                              {item.returned_qty}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={`text-sm font-medium ${
                              item.available_qty > 0
                                ? 'text-gray-900 dark:text-gray-500'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {item.available_qty}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center space-x-2">
                              <button
                                onClick={() => handleReturnQtyChange(
                                  item.item_code,
                                  Math.round(((item.return_qty || 0) - 1) * 100) / 100  // Round to 2 decimal places
                                )}
                                disabled={!item.return_qty || item.return_qty <= 0}
                                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                max={item.available_qty}
                                value={item.return_qty || 0}
                                onChange={(e) => handleReturnQtyChange(
                                  item.item_code,
                                  Math.round((parseFloat(e.target.value) || 0) * 100) / 100  // Round to 2 decimal places
                                )}
                                className="w-16 px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                                disabled={item.available_qty === 0}
                              />
                              <button
                                onClick={() => handleReturnQtyChange(
                                  item.item_code,
                                  Math.round(((item.return_qty || 0) + 1) * 100) / 100  // Round to 2 decimal places
                                )}
                                disabled={item.available_qty === 0 || (item.return_qty || 0) >= item.available_qty}
                                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-gray-900 dark:text-white">
                            {formatCurrency(item.rate, currency)}
                          </td>
                          <td className="px-4 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">
                            {formatCurrency((item.return_qty || 0) * item.rate, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Warning for no returnable items */}
              {returnItems.every(item => item.available_qty === 0) && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    <div>
                      <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        No Items Available for Return
                      </h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        All items from this invoice have already been returned.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </>
          )}
        </div>

        {/* Fixed Footer with Payment Methods and Return Button */}
        {hasItemsToReturn && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex-shrink-0">
            {/* Original Payment Methods Used */}
            {originalPayments && originalPayments.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wider mb-2">
                  Original Payments Made:
                </h4>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {originalPayments.map((p: any, idx: number) => {
                    const amt = parseFloat(p.amount || 0);
                    const origAmt = parseFloat(p.custom_payment_original_amount || 0);
                    if (amt === 0 && origAmt === 0) return null;
                    const displayAmt = p.custom_payment_currency && origAmt
                      ? `${formatCurrency(origAmt, p.custom_payment_currency)}`
                      : `${formatCurrency(amt, currency)}`;
                    return (
                      <div key={idx} className="text-sm text-blue-950 dark:text-blue-300">
                        <span className="font-medium">{p.mode_of_payment}:</span>{" "}
                        <span className="font-semibold">{displayAmt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Refund Payment Split UI */}
            <div className="mb-4 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Refund Method
              </h3>
              
              {/* Cash Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Cash Refund
                </div>
                
                {/* Currency toggle */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Currency:</span>
                  <select
                    value={cashCurrency}
                    onChange={(e) => handleCashCurrencyChange(e.target.value)}
                    className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold"
                  >
                    {Array.from(new Set(paymentModes.filter(m => m.type === "Cash").map(m => m.custom_currency || currencies.baseCurrency))).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  {/* Exchange rate input if different */}
                  {cashCurrency !== currencies.baseCurrency && (
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">Rate:</span>
                      <input
                        type="number"
                        value={cashRate}
                        onChange={(e) => handleCashRateChange(parseFloat(e.target.value) || 1)}
                        className="w-20 px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
                      />
                    </div>
                  )}
                </div>

                {/* Amount input */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm font-semibold">
                    {getCurrencySymbol(cashCurrency)}
                  </span>
                  <input
                    type="number"
                    value={cashAmount}
                    onChange={(e) => handleCashAmountChange(e.target.value)}
                    step="0.01"
                    min="0"
                    className="w-full pl-10 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right font-semibold"
                  />
                </div>
              </div>

              <hr className="border-gray-200 dark:border-gray-700 my-2" />

              {/* Bank Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Bank Refund
                </div>
                
                {/* Currency toggle */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Currency:</span>
                  <select
                    value={bankCurrency}
                    onChange={(e) => handleBankCurrencyChange(e.target.value)}
                    className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold"
                  >
                    {Array.from(new Set(paymentModes.filter(m => m.type === "Bank").map(m => m.custom_currency || currencies.baseCurrency))).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  {/* Exchange rate input if different */}
                  {bankCurrency !== currencies.baseCurrency && (
                    <div className="flex items-center space-x-1">
                      <span className="text-xs text-gray-500">Rate:</span>
                      <input
                        type="number"
                        value={bankRate}
                        onChange={(e) => handleBankRateChange(parseFloat(e.target.value) || 1)}
                        className="w-20 px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
                      />
                    </div>
                  )}
                </div>

                {/* Amount input */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm font-semibold">
                    {getCurrencySymbol(bankCurrency)}
                  </span>
                  <input
                    type="number"
                    value={bankAmount}
                    onChange={(e) => handleBankAmountChange(e.target.value)}
                    step="0.01"
                    min="0"
                    className="w-full pl-10 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right font-semibold"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-gray-900" />
                  <span>
                    {returnItems.filter(item => (item.return_qty || 0) > 0).length} item(s) selected for return
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReturn}
                  disabled={!hasItemsToReturn || isLoading || loadingReturnData}
                  className={`px-6 py-3 rounded-lg font-semibold text-base transition-colors shadow-lg ${
                    hasItemsToReturn && !isLoading && !loadingReturnData
                      ? 'bg-orange-600 text-white hover:bg-orange-700 hover:shadow-xl'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isLoading ? 'Processing Return...' : 'Process Return'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
