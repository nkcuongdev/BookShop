import { MapPin, Phone, User, Truck, StickyNote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateTimeVN, formatDateVN } from "@/utils/format.js";

function formatFullAddress(addr) {
  if (!addr) return "";
  return [addr.address, addr.ward, addr.district, addr.city]
    .filter(Boolean)
    .join(", ");
}

export default function OrderShippingCard({
  shippingAddress,
  trackingNumber,
  carrier,
  estimatedDelivery,
  trackingEvents = [],
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

        {(trackingNumber || carrier || estimatedDelivery) && (
          <div className="flex gap-2.5 pt-2.5 border-t border-gray-100">
            <Truck className="w-4 h-4 text-secondary-400 shrink-0 mt-0.5" />
            <div>
              {carrier && (
                <>
                  <dt className="text-xs text-secondary-500">Đơn vị vận chuyển</dt>
                  <dd className="font-medium text-secondary-800">{carrier}</dd>
                </>
              )}
              {trackingNumber && (
                <>
                  <dt className="text-xs text-secondary-500 mt-1">Mã vận đơn</dt>
                  <dd className="font-mono font-semibold text-secondary-800">
                    {trackingNumber}
                  </dd>
                </>
              )}
              {estimatedDelivery && (
                <p className="mt-1 text-xs text-secondary-500">
                  Dự kiến giao: {formatDateVN(estimatedDelivery)}
                </p>
              )}
            </div>
          </div>
        )}

        {trackingEvents.length > 0 && (
          <div className="pt-2.5 border-t border-gray-100">
            <dt className="text-xs text-secondary-500 mb-2">Chi tiết vận chuyển</dt>
            <dd className="space-y-2">
              {trackingEvents.slice().reverse().map((event, idx) => (
                <div key={`${event.status}-${idx}`} className="text-xs">
                  <p className="font-semibold text-secondary-800">
                    {event.description || event.status}
                  </p>
                  <p className="text-secondary-500">
                    {formatDateTimeVN(event.at)}
                    {event.location ? ` - ${event.location}` : ""}
                  </p>
                </div>
              ))}
            </dd>
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
