import { MapPin, Phone, User, Truck, StickyNote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateTimeVN, formatDateVN } from "@/utils/format.js";
import { formatFullAddress } from "@/utils/address";

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
      <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
        <MapPin className="size-4 text-primary" />
        Thông tin giao hàng
      </h3>

      <dl className="space-y-2.5 text-sm">
        <div className="flex gap-2.5">
          <User className="size-4 text-muted-foreground/70 shrink-0 mt-0.5" />
          <dd className="font-medium text-foreground">
            {shippingAddress.fullName}
          </dd>
        </div>
        <div className="flex gap-2.5">
          <Phone className="size-4 text-muted-foreground/70 shrink-0 mt-0.5" />
          <dd className="text-foreground">{shippingAddress.phone}</dd>
        </div>
        <div className="flex gap-2.5">
          <MapPin className="size-4 text-muted-foreground/70 shrink-0 mt-0.5" />
          <dd className="text-foreground leading-relaxed">
            {formatFullAddress(shippingAddress)}
          </dd>
        </div>

        {(trackingNumber || carrier || estimatedDelivery) && (
          <div className="flex gap-2.5 pt-2.5 border-t border-border">
            <Truck className="size-4 text-muted-foreground/70 shrink-0 mt-0.5" />
            <div>
              {carrier && (
                <>
                  <dt className="text-xs text-muted-foreground">Đơn vị vận chuyển</dt>
                  <dd className="font-medium text-foreground">{carrier}</dd>
                </>
              )}
              {trackingNumber && (
                <>
                  <dt className="text-xs text-muted-foreground mt-1">Mã vận đơn</dt>
                  <dd className="font-mono font-semibold text-foreground">
                    {trackingNumber}
                  </dd>
                </>
              )}
              {estimatedDelivery && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Dự kiến giao: {formatDateVN(estimatedDelivery)}
                </p>
              )}
            </div>
          </div>
        )}

        {trackingEvents.length > 0 && (
          <div className="pt-2.5 border-t border-border">
            <dt className="text-xs text-muted-foreground mb-2">Chi tiết vận chuyển</dt>
            <dd className="space-y-2">
              {trackingEvents.slice().reverse().map((event, idx) => (
                <div key={`${event.status}-${idx}`} className="text-xs">
                  <p className="font-semibold text-foreground">
                    {event.description || event.status}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDateTimeVN(event.at)}
                    {event.location ? ` - ${event.location}` : ""}
                  </p>
                </div>
              ))}
            </dd>
          </div>
        )}

        {note && (
          <div className="flex gap-2.5 pt-2.5 border-t border-border">
            <StickyNote className="size-4 text-muted-foreground/70 shrink-0 mt-0.5" />
            <div>
              <dt className="text-xs text-muted-foreground">Yêu cầu giao hàng</dt>
              <dd className="text-foreground italic">{note}</dd>
            </div>
          </div>
        )}
      </dl>
    </Card>
  );
}
