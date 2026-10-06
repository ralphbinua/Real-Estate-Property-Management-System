import { useState } from 'react';
import { Button } from 'react-bootstrap';
import { fetchPaymentAcknowledgment } from '../services/invoiceService';

export default function PaymentAcknowledgmentButton({ payment }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setError('');
    try {
      const document = await fetchPaymentAcknowledgment(payment.id);
      const url = URL.createObjectURL(document);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `payment-acknowledgment-${payment.id}.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      let message = 'Could not download this acknowledgment. Please try again.';
      if (downloadError.response?.data instanceof Blob) {
        try {
          const data = JSON.parse(await downloadError.response.data.text());
          if (typeof data.detail === 'string') message = data.detail;
        } catch { /* Keep the readable fallback for non-JSON errors. */ }
      }
      setError(message);
    } finally {
      setDownloading(false);
    }
  };

  if (payment.status !== 'Verified') return null;

  return (
    <div>
      <Button size="sm" variant="outline-primary" onClick={download} disabled={downloading} aria-label={`Download acknowledgment for payment ${payment.id}`}>
        {downloading ? 'Downloading…' : 'Download PDF'}
      </Button>
      {error && <div className="small text-danger mt-1" role="alert">{error}</div>}
    </div>
  );
}
