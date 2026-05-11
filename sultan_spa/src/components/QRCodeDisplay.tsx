"use client"

interface QRCodeDisplayProps {
  qrCodeURL: string
  caption: string
}

export default function QRCodeDisplay({ qrCodeURL, caption }: QRCodeDisplayProps) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto border border-border rounded bg-white p-1 flex items-center justify-center">
        <img
          src={qrCodeURL || "https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=SultanPOS"}
          alt="QR Code"
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=SultanPOS"
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-2">{caption}</p>
    </div>
  )
}
