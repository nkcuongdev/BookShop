import { MapPin, Phone, User, Truck, StickyNote } from "lucide-react";
import { Card } from "@/components/ui/card";

function formatFullAddress(addr) {
  if (!addr) return "";
  return [addr.address, addr.ward, addr.district, addr.city]
    .filter(Boolean)
    .join(", ");
}

export default function OrderShippingCard({
  shippingAddress,
  trackingNumber,
  note,
}) {
  if (!shippingAddress) return null;

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-secondary-800 text-sm mb-3 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary-500" />
        Thông tin giao hàng
      </h3>

      <dl className="space-y-2.5 text-sm">
        <div className="flex gap-2.5">
          <User className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
          <dd className="font-medium text-secondary-800">
            {shippingAddress.fullName}
          </dd>
        </div>
        <div className="flex gap-2.5">
          <Phone className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
          <dd className="text-secondary-700">{shippingAddress.phone}</dd>
        </div>
        <div className="flex gap-2.5">
          <MapPin className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
          <dd className="text-secondary-700 leading-relaxed">
            {formatFullAddress(shippingAddress)}
          </dd>
        </div>

        {trackingNumber && (
          <div className="flex gap-2.5 pt-2.5 border-t border-gray-100">
            <Truck className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
            <div>
              <dt className="text-xs text-secondary-500">Mã vận đơn</dt>
              <dd className="font-mono font-semibold text-secondary-800">
                {trackingNumber}
              </dd>
            </div>
          </div>
        )}

        {note && (
          <div className="flex gap-2.5 pt-2.5 border-t border-gray-100">
            <StickyNote className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
            <div>
              <dt className="text-xs text-secondary-500">Ghi chú</dt>
              <dd className="text-secondary-700 italic">{note}</dd>
            </div>
          </div>
        )}
      </dl>
    </Card>
  );
}
