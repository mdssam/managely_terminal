
import { useState, useEffect } from "react";
import { getPrintFormatHTML } from "./getPrintHTML.js";
import { usePOSDetails } from "../hooks/usePOSProfile.js";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

type PrintPreviewProps = {
  invoice: {
    pos_profile: string;
    name: string;
    [key: string]: unknown;
  };
  language?: "en" | "ar";
};

const LOGO_SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 141.732 141.732" style="width: 32mm; height: 32mm; margin: 0 auto; display: block;"><g transform="scale(1, -1) translate(0, -141.732)"><g><g><g transform="matrix(1.0 0.0 0.0 1.0 116.6301 118.0053)"><path d="M 0.0 0.0 L 3.323 -3.294 L 6.646 0.0 L 3.323 3.322 Z M 9.621 -7.526 C 10.777 -8.615, 11.354 -10.132, 11.354 -12.077 L 11.354 -14.966 L -5.836 -14.966 L -5.836 -5.894 L 4.796 -5.894 C 6.857 -5.894, 8.465 -6.438, 9.621 -7.526 M 11.354 -14.966 L 8.119 -14.966 C 7.213 -14.966, 6.466 -15.106, 5.88 -15.385 C 5.292 -15.664, 4.585 -16.218, 3.757 -17.046 L 2.802 -17.999 C 1.974 -18.828, 1.166 -19.381, 0.376 -19.661 C -0.415 -19.94, -1.579 -20.08, -3.12 -20.08 L -10.92 -20.08 L -10.92 -17.017 L -3.12 -17.017 C -2.099 -17.017, -1.276 -16.878, -0.65 -16.598 C -0.024 -16.319, 0.703 -15.765, 1.531 -14.937 L 2.485 -13.984 C 3.313 -13.156, 4.103 -12.602, 4.854 -12.322 C 5.605 -12.043, 6.694 -11.904, 8.119 -11.904 L 11.354 -11.904 Z M -7.887 -20.08 L -10.92 -20.08 L -10.92 3.0330000000000013 L -7.887 3.0330000000000013 Z M -7.887 3.033 M -19.154 -10.864 L -15.831 -14.157 L -12.51 -10.864 L -15.831 -7.541 Z M -27.417 0.0 L -24.095 -3.294 L -20.773 0.0 L -24.095 3.322 Z M -10.632 -2.832 L -10.632 -5.894 L -20.773 -5.894 L -20.773 -15.082 C -20.773 -16.026, -20.989 -16.878, -21.422 -17.638 C -21.856 -18.4, -22.453 -18.996, -23.214 -19.429 C -23.974 -19.863, -24.828 -20.08, -25.771 -20.08 L -29.092 -20.08 L -22.217 -2.832 Z" fill="black" stroke="none" stroke-width="1" /></g><path d="M 127.984 72.085 L 124.922 72.085 L 124.922 95.198 L 127.984 95.198 Z M 127.984 95.198 M 122.899 72.085 L 119.836 72.085 L 119.836 95.198 L 122.899 95.198 Z M 122.899 95.198 M 92.578 90.012 C 93.936 88.924, 95.048 87.34, 95.915 85.26 C 97.436 89.092, 99.747 92.405, 102.849 95.198 C 105.93 92.405, 108.232 89.092, 109.754 85.26 C 110.62 87.34, 111.738 88.924, 113.105 90.012 C 114.473 91.1, 116.042 91.644, 117.815 91.644 L 117.815 72.085 L 87.884 72.085 L 87.884 91.644 C 89.655 91.644, 91.22 91.1, 92.578 90.012 M 85.832 72.085 L 82.76899999999999 72.085 L 82.76899999999999 95.198 L 85.832 95.198 Z M 85.832 95.198 M 53.85 95.198 L 53.85 91.644 L 70.549 91.644 C 72.668 91.644, 74.492 91.206, 76.024 90.33 C 77.555 89.453, 78.725 88.182, 79.534 86.516 C 80.343 84.85, 80.747 82.862, 80.747 80.55 L 80.747 72.085 L 50.817 72.085 L 50.817 95.198 Z M 122.899 72.085 L 45.730999999999995 72.085 L 45.730999999999995 75.148 L 122.899 75.148 Z M 48.765 72.085 L 45.731 72.085 L 45.731 95.198 L 48.765 95.198 Z M 48.765 95.198 M 25.392 81.85 L 28.715 78.557 L 32.037 81.85 L 28.715 85.173 Z M 43.68 91.644 L 43.68 81.85 C 43.68 78.711, 42.842 76.298, 41.167 74.613 C 39.49 72.928, 37.074 72.085, 33.914 72.085 L 23.514 72.085 C 20.375 72.085, 17.962 72.928, 16.277 74.613 C 14.591 76.298, 13.748 78.711, 13.748 81.85 C 13.748 85.009, 14.587 87.43, 16.262 89.117 C 17.938 90.801, 20.355 91.644, 23.514 91.644 Z" fill="black" stroke="none" stroke-width="1" /></g><g><g transform="matrix(1.0 0.0 0.0 1.0 17.9032 31.1324)"><path d="M 0.0 0.0 L 0.0 -4.808 L 0.461 -4.808 C 1.251 -4.808, 1.647 -4.216, 1.647 -2.207 C 1.647 -0.659, 1.284 0.0, 0.461 0.0 Z M 0.0 7.575 L 0.0 2.898 L 0.297 2.898 C 1.02 2.898, 1.317 3.788, 1.317 5.106 C 1.317 7.146, 0.922 7.575, 0.23 7.575 Z M -3.689 10.966 L 0.824 10.966 C 3.623 10.966, 5.072 9.353, 5.072 6.555 C 5.072 3.984, 4.249 2.569, 2.469 1.976 L 2.469 1.91 C 3.986 1.68, 5.401 0.593, 5.401 -2.766 C 5.401 -5.928, 3.82 -8.234, 0.988 -8.234 L -3.689 -8.234 Z" fill="black" stroke="none" stroke-width="1" /></g><g><g transform="matrix(1.0 0.0 0.0 1.0 30.6209 30.1107)"><path d="M 0.0 0.0 L 1.385 0.0 L 1.153 3.229 L 0.858 7.576 L 0.659 7.576 L 0.297 3.261 Z M -1.613 11.988 L 3.327 11.988 L 5.732 -7.212 L 1.944 -7.212 L 1.648 -3.391 L -0.328 -3.391 L -0.691 -7.212 L -4.445 -7.212 Z" fill="black" stroke="none" stroke-width="1" /></g><g><g transform="matrix(1.0 0.0 0.0 1.0 39.9103 42.0988)"><path d="M 0.0 0.0 L 3.689 0.0 L 3.689 -9.188 L 5.83 0.0 L 9.222 0.0 L 7.048 -8.463 L 9.255 -19.2 L 5.567 -19.2 L 3.689 -9.749 L 3.689 -19.2 L 0.0 -19.2 Z" fill="black" stroke="none" stroke-width="1" /></g><g><g transform="matrix(1.0 0.0 0.0 1.0 52.7245 42.0988)"><path d="M 0.0 0.0 L 7.443 0.0 L 7.443 -3.621 L 3.689 -3.621 L 3.689 -7.773 L 6.95 -7.773 L 6.95 -11.13 L 3.689 -11.13 L 3.689 -15.545 L 7.509 -15.545 L 7.509 -19.2 L 0.0 -19.2 Z" fill="black" stroke="none" stroke-width="1" /></g><g><g transform="matrix(1.0 0.0 0.0 1.0 67.7996 38.7074)"><path d="M 0.0 0.0 L 0.0 -6.29 L 0.034 -6.29 C 0.922 -6.29, 1.415 -6.026, 1.415 -3.064 C 1.415 -0.725, 1.186 0.0, 0.098 0.0 Z M -3.689 3.391 L 0.625 3.391 C 3.952 3.391, 5.171 1.449, 5.171 -3.064 C 5.171 -5.204, 4.577 -6.817, 3.722 -7.904 L 5.533 -15.809 L 1.844 -15.809 L 0.692 -9.683 L 0.493 -9.683 L 0.0 -9.683 L 0.0 -15.809 L -3.689 -15.809 Z" fill="black" stroke="none" stroke-width="1" /></g><g><g transform="matrix(1.0 0.0 0.0 1.0 79.0283 29.354)"><path d="M 0.0 0.0 L -3.26 12.745 L 0.758 12.745 L 1.417 8.102 L 1.844 4.479 L 1.976 4.479 L 2.405 8.102 L 3.064 12.745 L 6.85 12.745 L 3.689 -0.329 L 3.689 -6.455 L 0.0 -6.455 Z" fill="black" stroke="none" stroke-width="1" /></g><g><g transform="matrix(1.0 0.0 0.0 1.0 115.3782 38.3125)"><path d="M 0.0 0.0 L 0.0 -6.202 L 1.453 -6.202 C 1.463 -6.181, 1.497 -6.121, 1.551 -6.025 C 1.582 -5.949, 1.632 -5.879, 1.696 -5.815 C 1.759 -5.75, 1.842 -5.694, 1.938 -5.645 C 2.035 -5.597, 2.154 -5.573, 2.294 -5.573 C 2.52 -5.573, 2.706 -5.653, 2.851 -5.815 C 2.997 -5.976, 3.068 -6.17, 3.068 -6.396 L 3.068 -9.093 C 3.068 -9.361, 3.002 -9.572, 2.867 -9.722 C 2.732 -9.873, 2.541 -9.948, 2.294 -9.948 C 2.045 -9.948, 1.844 -9.871, 1.688 -9.715 C 1.532 -9.559, 1.453 -9.34, 1.453 -9.06 L 1.453 -8.641 L -0.195 -8.641 L -0.195 -9.125 C -0.195 -9.512, -0.126 -9.857, 0.009 -10.159 C 0.142 -10.46, 0.322 -10.72, 0.549 -10.933 C 0.775 -11.149, 1.036 -11.314, 1.332 -11.428 C 1.628 -11.54, 1.938 -11.596, 2.261 -11.596 C 2.583 -11.596, 2.893 -11.54, 3.189 -11.428 C 3.486 -11.314, 3.747 -11.149, 3.973 -10.933 C 4.199 -10.72, 4.379 -10.46, 4.514 -10.159 C 4.649 -9.857, 4.716 -9.512, 4.716 -9.125 L 4.716 -6.154 C 4.716 -5.475, 4.541 -4.966, 4.19 -4.628 C 3.841 -4.288, 3.386 -4.118, 2.827 -4.118 C 2.536 -4.118, 2.271 -4.171, 2.035 -4.272 C 1.798 -4.374, 1.603 -4.5, 1.453 -4.651 L 1.453 -1.551 L 4.716 -1.551 L 4.716 0.0 Z M -4.739 -11.499 L -1.945 -1.647 L -1.945 0.0 L -6.855 0.0 L -6.855 -2.876 L -5.401 -2.876 L -5.401 -1.551 L -3.592 -1.551 L -6.484 -11.499 Z M -11.951 -2.375 C -11.951 -2.127, -11.871 -1.928, -11.708 -1.777 C -11.547 -1.626, -11.359 -1.551, -11.144 -1.551 C -10.928 -1.551, -10.739 -1.626, -10.578 -1.777 C -10.416 -1.928, -10.336 -2.127, -10.336 -2.375 L -10.336 -4.505 C -10.336 -4.754, -10.416 -4.952, -10.578 -5.103 C -10.739 -5.256, -10.928 -5.329, -11.144 -5.329 C -11.359 -5.329, -11.547 -5.256, -11.708 -5.103 C -11.871 -4.952, -11.951 -4.754, -11.951 -4.505 Z M -11.159 -11.499 L -8.995 -5.718 C -8.941 -5.567, -8.895 -5.424, -8.858 -5.289 C -8.82 -5.156, -8.785 -5.001, -8.753 -4.83 C -8.732 -4.668, -8.715 -4.472, -8.704 -4.239 C -8.694 -4.008, -8.688 -3.715, -8.688 -3.359 C -8.688 -2.983, -8.694 -2.672, -8.688 -2.431 C -8.715 -2.189, -8.732 -1.982, -8.753 -1.809 C -8.785 -1.647, -8.829 -1.507, -8.883 -1.39 C -8.936 -1.271, -9.0 -1.148, -9.076 -1.018 C -9.291 -0.673, -9.577 -0.401, -9.933 -0.202 C -10.287 -0.004, -10.691 0.096, -11.144 0.096 C -11.596 0.096, -12.002 0.0, -12.363 -0.195 C -12.724 -0.387, -13.012 -0.662, -13.227 -1.018 C -13.303 -1.148, -13.364 -1.271, -13.413 -1.39 C -13.46 -1.507, -13.495 -1.647, -13.518 -1.809 C -13.55 -1.982, -13.571 -2.189, -13.581 -2.431 C -13.593 -2.672, -13.599 -2.983, -13.599 -3.359 C -13.599 -3.812, -13.593 -4.187, -13.581 -4.483 C -13.571 -4.779, -13.55 -5.022, -13.518 -5.217 C -13.495 -5.411, -13.464 -5.569, -13.42 -5.694 C -13.378 -5.818, -13.318 -5.934, -13.243 -6.041 C -13.103 -6.256, -12.91 -6.433, -12.661 -6.573 C -12.414 -6.714, -12.144 -6.784, -11.853 -6.784 C -11.671 -6.784, -11.522 -6.77, -11.41 -6.743 C -11.296 -6.717, -11.214 -6.682, -11.159 -6.638 L -11.128 -6.67 L -13.001 -11.499 Z M -16.119 -11.499 L -16.119 0.0 L -17.768 0.0 L -19.415 -1.211 L -19.415 -2.956 L -17.768 -1.745 L -17.768 -11.499 Z M -7.338 -17.907 L -7.338 -17.908 C -7.341 -17.908, -7.345 -17.907, -7.35 -17.907 C -7.354 -17.907, -7.358 -17.908, -7.363 -17.908 L -7.363 -17.907 C -20.115 -17.898, -27.261 -11.878, -27.261 -5.814 C -27.261 0.251, -20.115 6.271, -7.363 6.28 L -7.363 6.28 C -7.358 6.28, -7.354 6.28, -7.35 6.28 C -7.345 6.28, -7.341 6.28, -7.338 6.28 L -7.338 6.28 C 5.551 6.271, 12.562 0.251, 12.562 -5.814 C 12.562 -11.878, 5.551 -17.898, -7.338 -17.907" fill="black" stroke="none" stroke-width="1" /></g></g></g></g></g></g></g></g></g></g></g></g></g></g></g></g></g></svg>';

function generateOfflineReceiptHTML(invoice: any, posDetails: any, language: "en" | "ar" = "en", qrDataUrl?: string, barcodeDataUrl?: string) {
  const isAr = language === "ar";
  const company = posDetails?.company || "Sultan POS";
  const cashier = invoice.cashier_name || invoice.cashier || "Cashier";
  const customer = invoice.customer_name || invoice.customer || "Walk-in Customer";
  const date = invoice.posting_date || invoice.date || new Date().toISOString().split('T')[0];
  const time = invoice.posting_time || invoice.time || new Date().toLocaleTimeString();
  
  // Clean up ID: strip "OFFLINE-" prefix to look identical to online receipts
  const rawId = invoice.name || invoice.id || "Offline Order";
  const id = rawId.startsWith("OFFLINE-") ? rawId.replace("OFFLINE-", "") : rawId;
  
  const items = invoice.items || [];
  const currency = invoice.currency || posDetails?.currency || "";
  
  // Calculate totals and subtotal properly for offline invoice objects (which use base_grand_total / grandTotal)
  const totalAmount = invoice.totalAmount || invoice.grand_total || invoice.base_grand_total || 0;
  const subtotal = invoice.subtotal || invoice.net_total || invoice.base_net_total || (items || []).reduce((sum: number, item: any) => sum + (item.amount || (item.qty * item.rate) || 0), 0) || totalAmount;
  const taxAmount = invoice.taxAmount || invoice.total_taxes_and_charges || 0;
  const discountAmount = invoice.discount_amount || invoice.discountAmount || 0;
  const paymentMethods = invoice.payment_methods || (invoice.paymentMethod ? [{ method: invoice.paymentMethod, amount: totalAmount }] : []);
  const taxId = posDetails?.tax_id || "";

  const t = {
    company: isAr ? "سلطان POS" : company,
    receipt: isAr ? "فاتورة مبيعات مبسطة" : "Sales Invoice",
    date: isAr ? "التاريخ:" : "Date:",
    time: isAr ? "الوقت:" : "Time:",
    cashier: isAr ? "الكاشير:" : "Cashier:",
    customer: isAr ? "العميل:" : "Customer:",
    id: isAr ? "رقم الفاتورة:" : "Invoice ID:",
    item: isAr ? "الصنف" : "Item",
    qty: isAr ? "الكمية" : "Qty",
    price: isAr ? "السعر" : "Price",
    total: isAr ? "الإجمالي" : "Total",
    subtotal: isAr ? "المجموع الفرعي" : "Subtotal",
    tax: isAr ? "ضريبة القيمة المضافة" : "VAT",
    discount: isAr ? "خصم" : "Discount",
    grandTotal: isAr ? "TOTAL" : "TOTAL",
    payment: isAr ? "طريقة الدفع" : "Payment Method",
    vatNo: isAr ? "الرقم الضريبي:" : "VAT No:",
    thanks: isAr ? "شكراً لزيارتكم" : "Thank you for your visit!"
  };

  const css = `
    @font-face {
      font-family: 'Outfit';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url('/assets/sultan/sultan_spa/fonts/inter-latin.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Tajawal';
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url('/assets/sultan/sultan_spa/fonts/tajawal-400-arabic.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Tajawal';
      font-style: normal;
      font-weight: 500;
      font-display: swap;
      src: url('/assets/sultan/sultan_spa/fonts/tajawal-500-arabic.woff2') format('woff2');
    }
    @font-face {
      font-family: 'Tajawal';
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url('/assets/sultan/sultan_spa/fonts/tajawal-700-arabic.woff2') format('woff2');
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html { 
        width: 100%; 
        max-width: 100%;
        margin: 0;
        padding: 0;
        font-size: 11px; 
        color: #111; 
        background: #fff; 
        font-family: 'Outfit', 'Tajawal', sans-serif;
        line-height: 1.5;
        position: relative;
        direction: ${isAr ? 'rtl' : 'ltr'};
    }
    .center { text-align: center; }
    .bold   { font-weight: 700; }
    .medium { font-weight: 500; }
    .small  { font-size: 9px; color: #666; }
    .lg     { font-size: 13px; }
    .xl     { font-size: 16px; }
    .divider { 
        border-top: 1px dashed #aaa; 
        margin: 8px 0; 
    }
    .solid  { 
        border-top: 1px solid #111; 
        margin: 8px 0; 
    }
    .double {
        border-top: 3px double #111;
        margin: 8px 0;
    }
    table   { width: 100%; border-collapse: collapse; }
    td, th  { padding: 4px 2px; vertical-align: top; }
    th      { font-weight: 700; border-bottom: 1.5px solid #111; font-size: 10px; color: #333; }
    .r { text-align: ${isAr ? 'left' : 'right'}; }
    .c { text-align: center; }
    .logo-container {
        text-align: center;
        margin-bottom: 12px;
    }
    .receipt-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.5px;
        margin: 4px 0;
        text-transform: uppercase;
        color: #444;
    }
    .meta-info {
        font-size: 10px;
        line-height: 1.6;
    }
    .meta-info td {
        padding: 2px 0;
    }
    .meta-label {
        color: #666;
    }
    .item-table th {
        padding-bottom: 6px;
        text-transform: uppercase;
    }
    .item-table td {
        font-size: 10.5px;
        padding: 5px 2px;
    }
    .item-name {
        font-weight: 500;
        color: #111;
    }
    .totals-table td {
        padding: 4px 2px;
        font-size: 11px;
    }
    .grand td { 
        font-size: 14px; 
        font-weight: 700; 
        padding-top: 6px;
    }
    .payment-table td {
        font-size: 10px;
        padding: 3px 2px;
    }
    .footer-msg {
        font-size: 10px;
        font-weight: 500;
        margin-top: 10px;
        color: #555;
        line-height: 1.5;
    }
    .watermark {
        position: absolute;
        top: 40%;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 45px;
        color: rgba(0, 0, 0, 0.06);
        font-weight: 900;
        transform: rotate(-25deg);
        z-index: 1000;
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
    }
    .en {
        direction: ltr;
        unicode-bidi: embed;
    }
  `;

  // Filter items mapping
  const itemsHtml = items.map((item: any) => {
    const itemName = item.item_name || item.item_code || "Unknown Item";
    const qty = item.qty ?? item.quantity ?? 1;
    const rate = item.rate ?? item.price ?? 0;
    const amount = qty * rate;
    return `
      <tr style="border-bottom: 1px dashed #eee;">
        <td style="padding: 6px 0; text-align: ${isAr ? 'right' : 'left'};">
          <div class="item-name">${itemName}</div>
        </td>
        <td class="c bold" style="vertical-align: middle;">${Math.round(qty)}</td>
        <td class="r bold" style="vertical-align: middle;">${rate.toFixed(2)}</td>
        <td class="r bold" style="vertical-align: middle;">${amount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Payment methods breakdown
  const paymentMethodsHtml = paymentMethods.map((p: any) => {
    const pmName = p.method || p.mode_of_payment || "Payment";
    const pmAmount = p.amount || totalAmount;
    let displayName = pmName;
    if (pmName.toLowerCase().includes("cash")) {
      displayName = isAr ? "كاش" : "Cash";
    } else if (pmName.toLowerCase().includes("card") || pmName.toLowerCase().includes("visa") || pmName.toLowerCase().includes("bank")) {
      displayName = isAr ? "فيزا / مدى" : "Card";
    }
    return `
      <tr>
        <td>${displayName}</td>
        <td class="r bold">${pmAmount.toFixed(2)} ${currency}</td>
      </tr>
    `;
  }).join('');

  // Draft watermark for offline unsubmitted status
  const watermarkHtml = (invoice.docstatus === 0 || invoice.status === 'Draft') 
    ? `<div class="watermark">${isAr ? 'مسودة' : 'DRAFT'}</div>` 
    : '';

  // Render QR Code Section if custom_qr_code exists or we have generated qrDataUrl
  const finalQr = qrDataUrl || invoice.custom_qr_code;
  const qrCodeHtml = finalQr
    ? `
      <div class="divider"></div>
      <div class="center" style="margin: 8px 0;">
        <img src="${finalQr}" style="width: 32mm; height: 32mm;" />
      </div>
    `
    : '';

  return `
    <style>${css}</style>
    <div style="font-family: 'Outfit', 'Tajawal', Arial, sans-serif; max-width: 100%; margin: 0 auto; padding: 8px; color: #111; position: relative;">
      ${watermarkHtml}
      
      <div class="logo-container">
        ${LOGO_SQUARE}
        ${taxId ? `<div class="small" style="margin-top: 6px;">${t.vatNo} <span class="en">${taxId}</span></div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="center">
        <div class="bold lg" style="letter-spacing: 0.5px;">${id}</div>
      </div>

      <div class="divider"></div>

      <div class="meta-info">
        <table>
          <tr>
            <td class="meta-label">${t.date}</td>
            <td class="r bold">${date} ${time}</td>
          </tr>
          <tr>
            <td class="meta-label">${t.cashier}</td>
            <td class="r bold">${cashier}</td>
          </tr>
          <tr>
            <td class="meta-label">${t.customer}</td>
            <td class="r bold">${customer}</td>
          </tr>
        </table>
      </div>

      <div class="divider"></div>

      <table class="item-table">
        <thead>
          <tr>
            <th style="width:45%; text-align: ${isAr ? 'right' : 'left'};">${t.item}</th>
            <th class="c" style="width:15%;">${t.qty}</th>
            <th class="r" style="width:20%;">${t.price}</th>
            <th class="r" style="width:20%;">${t.total}</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="solid"></div>

      <table class="totals-table">
        <tr>
          <td>${t.subtotal}</td>
          <td class="r bold">${subtotal.toFixed(2)} ${currency}</td>
        </tr>
        ${taxAmount > 0 ? `
        <tr>
          <td>${t.tax}</td>
          <td class="r bold">${taxAmount.toFixed(2)} ${currency}</td>
        </tr>
        ` : ''}
        ${discountAmount > 0 ? `
        <tr>
          <td>${t.discount}</td>
          <td class="r bold" style="color: red;">-${discountAmount.toFixed(2)} ${currency}</td>
        </tr>
        ` : ''}
        <tr class="grand">
          <td style="border-top: 1.5px solid #111; padding-top: 6px;">${t.grandTotal} ${currency}</td>
          <td class="r bold" style="border-top: 1.5px solid #111; padding-top: 6px; font-size: 15px;">${totalAmount.toFixed(2)}</td>
        </tr>
      </table>

      ${paymentMethodsHtml ? `
      <div class="divider"></div>
      <table class="payment-table">
        ${paymentMethodsHtml}
      </table>
      ` : ''}

      <div class="divider"></div>

      <div class="center" style="margin: 12px 0;">
        ${barcodeDataUrl 
          ? `<img src="${barcodeDataUrl}" style="width: 50mm; height: 12mm; display: block; margin: 0 auto;" />`
          : `<div style="border: 1px dashed #ccc; padding: 10px; font-family: monospace; display: inline-block;">[Barcode: ${id}]</div>`
        }
        <div style="font-family: monospace; font-size: 10px; margin-top: 4px; letter-spacing: 1px;">${id}</div>
      </div>

      ${qrCodeHtml}

      <div class="divider"></div>

      <div class="center footer-msg">
        <div class="bold">${t.thanks}</div>
      </div>
    </div>
  `;
}


export default function PrintPreview({ invoice, language = "en" }: PrintPreviewProps) {
  const [html, setHtml] = useState("");
  const [style, setStyle] = useState("");
  const [loading, setLoading] = useState(true);
  const [iframeHeight, setIframeHeight] = useState("520px");

  const { posDetails, loading: posLoading } = usePOSDetails();

  const printFormat =
    language === "ar"
      ? posDetails?.custom_pos_print_format_ar || posDetails?.custom_pos_print_format_en || posDetails?.print_format || "Sales Invoice"
      : posDetails?.custom_pos_print_format_en || posDetails?.custom_pos_print_format_ar || posDetails?.print_format || "Sales Invoice";
  const isOfflineInvoice = 
    (typeof invoice.name === 'string' && invoice.name.startsWith('OFFLINE-')) ||
    (typeof invoice.id === 'string' && invoice.id.startsWith('OFFLINE-')) ||
    (typeof window !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    if (isOfflineInvoice) {
      const renderOffline = async () => {
        setLoading(true);
        let qrDataUrl = "";
        let barcodeDataUrl = "";

        const company = posDetails?.company || "Sultan POS";
        const taxId = posDetails?.tax_id || "";
        const date = invoice.posting_date || invoice.date || new Date().toISOString().split('T')[0];
        const time = invoice.posting_time || invoice.time || new Date().toLocaleTimeString();
        const timestamp = `${date}T${time}`;
        
        // Use mapped totals for QR Code content so it is accurate and doesn't read 0.00
        const finalGrandTotal = invoice.totalAmount || invoice.grand_total || invoice.base_grand_total || 0;
        const finalVatAmount = invoice.taxAmount || invoice.total_taxes_and_charges || 0;
        const grandTotal = finalGrandTotal.toString();
        const vatAmount = finalVatAmount.toString();
        
        const rawId = invoice.name || invoice.id || "Offline Order";
        const id = rawId.startsWith("OFFLINE-") ? rawId.replace("OFFLINE-", "") : rawId;

        // Generate ZATCA base64 TLV and QR code image URL
        try {
          const getTlvString = (tag: number, value: string): Uint8Array => {
            const valueBytes = new TextEncoder().encode(value);
            const tagLength = valueBytes.length;
            const tlv = new Uint8Array(2 + tagLength);
            tlv[0] = tag;
            tlv[1] = tagLength;
            tlv.set(valueBytes, 2);
            return tlv;
          };

          const tag1 = getTlvString(1, company);
          const tag2 = getTlvString(2, taxId);
          const tag3 = getTlvString(3, timestamp);
          const tag4 = getTlvString(4, grandTotal);
          const tag5 = getTlvString(5, vatAmount);

          const totalLength = tag1.length + tag2.length + tag3.length + tag4.length + tag5.length;
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          [tag1, tag2, tag3, tag4, tag5].forEach(tag => {
            combined.set(tag, offset);
            offset += tag.length;
          });

          const binString = Array.from(combined, (byte) => String.fromCharCode(byte)).join("");
          const base64Tlv = btoa(binString);

          qrDataUrl = await QRCode.toDataURL(base64Tlv, { margin: 1, width: 120 });
        } catch (e) {
          console.error("Failed to generate ZATCA QR code offline:", e);
        }

        // Generate Code 128 barcode image URL
        try {
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, id, {
            format: "CODE128",
            lineColor: "#000",
            width: 2,
            height: 48,
            displayValue: false
          });
          barcodeDataUrl = canvas.toDataURL("image/png");
        } catch (e) {
          console.error("Failed to generate barcode offline:", e);
        }

        const offlineHtml = generateOfflineReceiptHTML(invoice, posDetails, language, qrDataUrl, barcodeDataUrl);
        setHtml(offlineHtml);
        setStyle("");
        setLoading(false);
      };

      renderOffline();
      return;
    }

    const fetchPrintHTML = async () => {
      if (posLoading || !posDetails) return;

      setLoading(true);
      try {
        const invoiceName = typeof invoice.name === 'string' ? invoice.name : '';
        const isPosInvoice = invoiceName.includes("PSINV") || invoice.doctype === "POS Invoice";
        const invoiceForAPI: { doctype: string; name: string; [key: string]: unknown } = {
          ...invoice,
          doctype: isPosInvoice ? 'POS Invoice' : 'Sales Invoice',
          name: invoiceName
        };
        const { html, style } = await getPrintFormatHTML(invoiceForAPI, printFormat);
        setHtml(html);
        setStyle(style);
      } catch (err) {
        console.error("Error loading print format:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrintHTML();
  }, [invoice, posDetails, posLoading, printFormat, isOfflineInvoice, language]);

  if (loading) return <p>Loading Print Preview...</p>;

  const styleBlock = style.trim().toLowerCase().includes("<style")
    ? style
    : `<style>${style}</style>`;

  const previewDocument = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      background: #fff;
    }
  </style>
  ${styleBlock}
</head>
<body>
  ${html}
</body>
</html>`;

  return (
    <div className="print-preview-container w-full">
      <iframe
        title="Receipt Preview"
        className="print-preview-content w-full bg-white border-0"
        srcDoc={previewDocument}
        scrolling="no"
        style={{ height: iframeHeight, overflow: "hidden" }}
        onLoad={(e) => {
          const iframe = e.target as HTMLIFrameElement;
          const updateHeight = () => {
            try {
              if (iframe?.contentWindow?.document?.body) {
                const body = iframe.contentWindow.document.body;
                const htmlEl = iframe.contentWindow.document.documentElement;
                const height = Math.max(
                  body.scrollHeight,
                  body.offsetHeight,
                  htmlEl.clientHeight,
                  htmlEl.scrollHeight,
                  htmlEl.offsetHeight
                );
                setIframeHeight(`${height + 16}px`);
              }
            } catch (err) {
              console.warn("Failed to adjust iframe height:", err);
            }
          };

          updateHeight();
          // Run again after a short delay in case images or fonts are still rendering
          setTimeout(updateHeight, 300);
        }}
      />
    </div>
  );
}
