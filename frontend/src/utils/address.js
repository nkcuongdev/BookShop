export function formatFullAddress(address = {}) {
  return [address.address, address.ward, address.district, address.city]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}
