
import { useState, useEffect } from "react";
import { getPrintFormatHTML } from "./getPrintHTML.js";
import { usePOSDetails } from "../hooks/usePOSProfile.js";

type PrintPreviewProps = {
  invoice: {
    pos_profile: string;
    name: string;
    [key: string]: unknown;
  };
};

export default function PrintPreview({ invoice }: PrintPreviewProps) {
  const [html, setHtml] = useState("");
  const [style, setStyle] = useState("");
  const [loading, setLoading] = useState(true);

  const { posDetails, loading: posLoading } = usePOSDetails();

  const printFormat = posDetails?.print_format ?? "Sales Invoice";
  const isOfflineInvoice = typeof invoice.name === 'string' && invoice.name.startsWith('OFFLINE-');

  useEffect(() => {
    if (isOfflineInvoice) {
      setLoading(false);
      return;
    }

    const fetchPrintHTML = async () => {
      if (posLoading || !posDetails) return;

      setLoading(true);
      try {
        const invoiceName = typeof invoice.name === 'string' ? invoice.name : '';
        const invoiceForAPI: { doctype: string; name: string; [key: string]: unknown } = {
          ...invoice,
          doctype: 'Sales Invoice',
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
  }, [invoice, posDetails, posLoading, printFormat, isOfflineInvoice]);

  if (loading) return <p>Loading Print Preview...</p>;

  if (isOfflineInvoice) {
    return (
      <div className="p-4 text-center text-sm text-gray-600">
        <p className="font-semibold text-gray-800 mb-1">Sale Saved Offline</p>
        <p className="text-xs text-gray-500">Receipt will be available once the device reconnects and syncs.</p>
        <p className="mt-2 text-xs font-mono text-gray-400">{invoice.name}</p>
      </div>
    );
  }

  return (
    <div className="print-preview-container p-4 bg-white shadow overflow-auto max-h-[90vh]">
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div
        className="print-preview-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
