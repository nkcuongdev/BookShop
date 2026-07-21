const crypto = require("crypto");
const Book = require("../models/Book");
const Order = require("../models/Order");
const config = require("../config");

const GHN_SANDBOX_BASE_URL =
  "https://dev-online-gateway.ghn.vn/shiip/public-api";
const SANDBOX_SIMULATION_STEPS = Object.freeze([
  {
    status: "picking",
    description: "[Mô phỏng] Shipper GHN Sandbox đang đến lấy hàng",
  },
  {
    status: "picked",
    description: "[Mô phỏng] GHN Sandbox đã lấy hàng",
  },
  {
    status: "storing",
    description: "[Mô phỏng] Kiện hàng đã đến kho GHN Sandbox",
  },
  {
    status: "transporting",
    description: "[Mô phỏng] Kiện hàng đang được luân chuyển",
  },
  {
    status: "sorting",
    description: "[Mô phỏng] Kiện hàng đang được phân loại",
  },
  {
    status: "delivering",
    description: "[Mô phỏng] Shipper đang giao hàng cho khách",
  },
  {
    status: "delivered",
    description: "[Mô phỏng] Giao hàng thành công",
  },
]);

const IN_TRANSIT_STATUSES = new Set([
  "picked",
  "storing",
  "transporting",
  "sorting",
  "delivering",
  "money_collect_delivering",
]);
const DELIVERED_STATUSES = new Set(["delivered"]);
const catalogCache = new Map();
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

function shippingError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\b(thanh pho|tp\.?|tinh|quan|q\.?|huyen|thi xa|phuong|p\.?|xa)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ghnConfig() {
  return config.shipping.ghn;
}

function isGhnEnabled() {
  const ghn = ghnConfig();
  return Boolean(ghn.enabled && ghn.token && ghn.shopId);
}

async function ghnRequest(path, { method = "POST", body, includeShop = false } = {}) {
  const ghn = ghnConfig();
  if (!isGhnEnabled()) {
    throw shippingError(
      "GHN Sandbox chưa được cấu hình",
      "SHIPPING_NOT_CONFIGURED",
      503
    );
  }
  if (ghn.baseUrl.replace(/\/$/, "") !== GHN_SANDBOX_BASE_URL) {
    throw shippingError(
      "Project chỉ cho phép kết nối GHN Sandbox",
      "GHN_PRODUCTION_DISABLED",
      503
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ghn.requestTimeoutMs);
  try {
    const response = await fetch(`${ghn.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Token: ghn.token,
        ...(includeShop ? { ShopId: String(ghn.shopId) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || Number(payload?.code) !== 200) {
      throw shippingError(
        payload?.message || `GHN trả về HTTP ${response.status}`,
        payload?.code_message || "GHN_REQUEST_FAILED",
        response.status >= 500 ? 503 : 400
      );
    }
    return payload.data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw shippingError("GHN phản hồi quá thời gian", "GHN_TIMEOUT", 503);
    }
    if (error?.code) throw error;
    throw shippingError("Không thể kết nối GHN", "GHN_UNAVAILABLE", 503);
  } finally {
    clearTimeout(timer);
  }
}

async function cachedCatalog(key, loader) {
  const current = catalogCache.get(key);
  if (current && current.expiresAt > Date.now()) return current.promise;
  const promise = loader().catch((error) => {
    catalogCache.delete(key);
    throw error;
  });
  catalogCache.set(key, { promise, expiresAt: Date.now() + CATALOG_TTL_MS });
  return promise;
}

function findCatalogItems(items, name, nameFields) {
  const target = normalizeName(name);
  if (!target) return [];
  const exact = [];
  const aliased = [];
  for (const item of items) {
    let isExact = false;
    let isAlias = false;
    for (const field of nameFields) {
      const value = item?.[field];
      if (!Array.isArray(value) && normalizeName(value) === target) isExact = true;
      const candidates = Array.isArray(value) ? value : [value];
      if (candidates.some((candidate) => normalizeName(candidate) === target)) {
        isAlias = true;
      }
    }
    if (isExact) exact.push(item);
    else if (isAlias) aliased.push(item);
  }
  return [...exact, ...aliased];
}

function findCatalogItem(items, name, nameFields) {
  const target = normalizeName(name);
  if (!target) return null;
  // GHN can return duplicate administrative entries whose aliases overlap
  // (for example "Hà Nội 02" has "Hà Nội" in NameExtension). Prefer an
  // exact match on the provider's canonical name before considering aliases,
  // otherwise the first duplicate may lead to an empty district catalogue.
  for (const field of nameFields) {
    const exact = items.find((item) => {
      const value = item?.[field];
      return !Array.isArray(value) && normalizeName(value) === target;
    });
    if (exact) return exact;
  }
  return items.find((item) =>
    nameFields
      .flatMap((field) => {
        const value = item?.[field];
        return Array.isArray(value) ? value : [value];
      })
      .some((candidate) => normalizeName(candidate) === target)
  ) || null;
}

async function resolveGhnAddress(address = {}) {
  // GHN master data is still the pre-07/2025 three-level catalogue: /master-data
  // /ward requires a DistrictID, so a two-level address cannot be resolved.
  const missing = [
    [address.city, "tỉnh/thành"],
    [address.district, "quận/huyện"],
    [address.ward, "phường/xã"],
  ]
    .filter(([value]) => !String(value || "").trim())
    .map(([, label]) => label);
  if (missing.length > 0) {
    throw shippingError(
      `GHN cần địa chỉ có ${missing.join(", ")}. Vui lòng chọn địa chỉ theo danh mục có quận/huyện.`,
      "GHN_ADDRESS_INCOMPLETE"
    );
  }
  const provinces = await cachedCatalog("provinces", () =>
    ghnRequest("/master-data/province", { method: "GET" })
  );
  // The sandbox catalogue contains duplicate provinces (e.g. "Hà Nội" and
  // "Hà Nội 02", the latter with an empty district list), so every name match is
  // tried until one actually resolves the requested district.
  const provinceCandidates = findCatalogItems(provinces || [], address.city, [
    "ProvinceName",
    "NameExtension",
  ]);
  if (provinceCandidates.length === 0) {
    throw shippingError("GHN không nhận diện được tỉnh/thành", "GHN_PROVINCE_NOT_FOUND");
  }
  let provinceId = null;
  let district = null;
  for (const candidate of provinceCandidates) {
    const candidateId = Number(candidate.ProvinceID);
    const districts = await cachedCatalog(`districts:${candidateId}`, () =>
      ghnRequest("/master-data/district", { body: { province_id: candidateId } })
    );
    const match = findCatalogItem(districts || [], address.district, [
      "DistrictName",
      "NameExtension",
    ]);
    if (match) {
      provinceId = candidateId;
      district = match;
      break;
    }
  }
  if (!district) {
    throw shippingError("GHN không nhận diện được quận/huyện", "GHN_DISTRICT_NOT_FOUND");
  }
  const districtId = Number(district.DistrictID);
  const wards = await cachedCatalog(`wards:${districtId}`, () =>
    ghnRequest("/master-data/ward", { body: { district_id: districtId } })
  );
  const ward = findCatalogItem(wards || [], address.ward, [
    "WardName",
    "NameExtension",
  ]);
  if (!ward) {
    throw shippingError("GHN không nhận diện được phường/xã", "GHN_WARD_NOT_FOUND");
  }
  return {
    provinceId,
    districtId,
    wardCode: String(ward.WardCode),
  };
}

function positiveMetric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.ceil(number) : fallback;
}

function packageFromBooks(items, books) {
  const bookMap = new Map(books.map((book) => [String(book._id), book]));
  let weight = 0;
  let length = 0;
  let width = 0;
  let height = 0;
  const providerItems = items.map((item) => {
    const book = bookMap.get(String(item.bookId || item.book));
    if (!book) {
      throw shippingError("Không tìm thấy sách để tính vận chuyển", "BOOK_NOT_FOUND");
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw shippingError("Số lượng sách không hợp lệ", "INVALID_QUANTITY");
    }
    const itemWeight = positiveMetric(book.weight, 300);
    const itemLength = positiveMetric(book.dimensions?.length, 24);
    const itemWidth = positiveMetric(book.dimensions?.width, 16);
    const itemHeight = positiveMetric(book.dimensions?.height, 3);
    weight += itemWeight * quantity;
    length = Math.max(length, itemLength);
    width = Math.max(width, itemWidth);
    height += itemHeight * quantity;
    return {
      name: String(book.title || "Sách").slice(0, 255),
      quantity,
      weight: itemWeight,
      length: itemLength,
      width: itemWidth,
      height: itemHeight,
    };
  });
  return {
    weight: Math.max(100, weight),
    length: Math.max(1, length),
    width: Math.max(1, width),
    height: Math.max(1, height),
    items: providerItems,
  };
}

async function packageFromCartItems(items = []) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw shippingError("Giỏ hàng không hợp lệ", "INVALID_SHIPPING_ITEMS");
  }
  const ids = items.map((item) => String(item?.bookId || ""));
  if (ids.some((id) => !/^[0-9a-f]{24}$/i.test(id))) {
    throw shippingError("Mã sách không hợp lệ", "INVALID_BOOK_ID");
  }
  const books = await Book.find({ _id: { $in: ids }, status: "active" })
    .select("title weight dimensions")
    .lean();
  if (books.length !== new Set(ids).size) {
    throw shippingError("Một số sách không còn khả dụng", "BOOK_NOT_AVAILABLE");
  }
  return packageFromBooks(items, books);
}

function serviceTypeForParcel(parcel) {
  // GHN calculates volumetric weight in grams as L x W x H / 5 and uses
  // whichever is higher. Parcels from 20 kg use the heavy-goods service.
  const volumetricWeight = Math.ceil(
    (parcel.length * parcel.width * parcel.height) / 5
  );
  const chargeableWeight = Math.max(parcel.weight, volumetricWeight);
  return chargeableWeight >= 20_000 ? 5 : 2;
}

async function getGhnQuotes({ items, shippingAddress, orderValue = 0 }) {
  const [destination, parcel] = await Promise.all([
    resolveGhnAddress(shippingAddress),
    packageFromCartItems(items),
  ]);
  const ghn = ghnConfig();
  const requiredServiceTypeId = serviceTypeForParcel(parcel);
  let services;
  if (ghn.fromDistrictId) {
    services = await ghnRequest("/v2/shipping-order/available-services", {
      body: {
        shop_id: ghn.shopId,
        from_district: ghn.fromDistrictId,
        to_district: destination.districtId,
      },
    });
  } else {
    services = [
      {
        service_id: null,
        service_type_id: requiredServiceTypeId,
      },
    ];
  }
  const uniqueServices = (services || [])
    .filter((service) => service.service_id || service.service_type_id)
    .filter(
      (service) => Number(service.service_type_id) === requiredServiceTypeId
    )
    .filter(
      (service, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.service_id === service.service_id &&
            candidate.service_type_id === service.service_type_id
        ) === index
    )
    .slice(0, 3);
  const results = await Promise.allSettled(
    uniqueServices.map(async (service) => {
      const body = {
        to_district_id: destination.districtId,
        to_ward_code: destination.wardCode,
        weight: parcel.weight,
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
        insurance_value: Math.min(Math.max(Number(orderValue) || 0, 0), 5_000_000),
        items: parcel.items,
        ...(service.service_id
          ? { service_id: Number(service.service_id) }
          : { service_type_id: Number(service.service_type_id) || 2 }),
      };
      const fee = await ghnRequest("/v2/shipping-order/fee", {
        body,
        includeShop: true,
      });
      let estimatedDelivery = null;
      if (service.service_id) {
        const leadtime = await ghnRequest("/v2/shipping-order/leadtime", {
          body: {
            ...(ghn.fromDistrictId
              ? { from_district_id: ghn.fromDistrictId }
              : {}),
            ...(ghn.fromWardCode ? { from_ward_code: ghn.fromWardCode } : {}),
            to_district_id: destination.districtId,
            to_ward_code: destination.wardCode,
            service_id: Number(service.service_id),
          },
          includeShop: true,
        }).catch(() => null);
        if (Number(leadtime?.leadtime) > 0) {
          estimatedDelivery = new Date(Number(leadtime.leadtime) * 1000).toISOString();
        }
      }
      const serviceId = Number(service.service_id) || null;
      const serviceTypeId =
        Number(service.service_type_id) || requiredServiceTypeId;
      return {
        id: serviceId ? `ghn:${serviceId}` : `ghn:type-${serviceTypeId}`,
        provider: "ghn",
        method: "standard",
        title: "Giao hàng GHN",
        description: estimatedDelivery
          ? "Cước phí và thời gian giao dự kiến được tính tự động bởi GHN"
          : "Cước phí được tính tự động theo trọng lượng và kích thước kiện hàng",
        fee: Math.max(0, Number(fee?.total ?? fee?.service_fee) || 0),
        estimatedDelivery,
        serviceId,
        serviceTypeId,
        destination,
      };
    })
  );
  const options = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((a, b) => a.fee - b.fee)
    .slice(0, 1);
  if (!options.length) {
    throw shippingError("GHN chưa có dịch vụ phù hợp cho địa chỉ này", "GHN_NO_SERVICE");
  }
  return {
    provider: "ghn",
    environment: "sandbox",
    source: "sandbox",
    warning: "Dữ liệu vận chuyển đang sử dụng môi trường GHN Sandbox.",
    options,
  };
}

async function getShippingQuotes(input) {
  if (!isGhnEnabled()) {
    throw shippingError(
      "GHN Sandbox chưa được cấu hình; không có biểu phí mô phỏng thay thế.",
      "SHIPPING_NOT_CONFIGURED",
      503
    );
  }
  return getGhnQuotes(input);
}

async function resolveShippingSelection(input) {
  const quotes = await getShippingQuotes(input);
  const requested = String(input.optionId || "standard");
  const option = quotes.options.find((item) => item.id === requested);
  if (!option) {
    throw shippingError(
      "Phương thức vận chuyển đã thay đổi, vui lòng chọn lại",
      "SHIPPING_QUOTE_CHANGED",
      409
    );
  }
  return {
    method: option.method,
    fee: option.fee,
    snapshot: {
      provider: option.provider,
      environment: "sandbox",
      quoteId: option.id,
      serviceId: option.serviceId || null,
      serviceTypeId: option.serviceTypeId || null,
      serviceName: option.title,
      quotedFee: option.fee,
      quotedAt: new Date(),
      estimatedDelivery: option.estimatedDelivery || null,
    },
  };
}

function parcelFromOrder(order) {
  const books = (order.items || []).map((item) => ({
    _id: item.book,
    title: item.title,
    weight: item.weight,
    dimensions: item.dimensions,
  }));
  return packageFromBooks(order.items || [], books);
}

async function findExistingGhnOrder(orderCode) {
  try {
    return await ghnRequest("/v2/shipping-order/detail-by-client-code", {
      body: { client_order_code: orderCode },
    });
  } catch {
    return null;
  }
}

function scheduleSandboxSimulation(order, { restart = false } = {}) {
  const simulation = ghnConfig().simulation;
  order.shipment.environment = "sandbox";
  if (!simulation.enabled) return;
  if (order.shipment.simulation?.completedAt && !restart) return;
  order.shipment.simulation.enabled = true;
  order.shipment.simulation.step = restart
    ? 0
    : Number(order.shipment.simulation.step) || 0;
  order.shipment.simulation.nextAt = new Date(
    Date.now() + simulation.stepDelayMs
  );
  order.shipment.simulation.completedAt = null;
  order.shipment.simulation.lastError = "";
}

async function createGhnShipment(orderId) {
  if (!isGhnEnabled()) {
    throw shippingError(
      "GHN Sandbox chưa được cấu hình",
      "SHIPPING_NOT_CONFIGURED",
      503
    );
  }
  const order = await Order.findById(orderId);
  if (!order) throw shippingError("Không tìm thấy đơn hàng", "ORDER_NOT_FOUND", 404);
  if (order.status !== Order.STATUS.PROCESSING) {
    throw shippingError("Chỉ tạo vận đơn khi đơn đang xử lý", "INVALID_ORDER_STATUS");
  }
  if (order.shipment?.provider !== "ghn") {
    throw shippingError("Đơn hàng không chọn dịch vụ GHN", "NOT_GHN_ORDER");
  }
  if (order.shipment.providerOrderCode) {
    if (
      order.shipment.environment !== "sandbox" ||
      (!order.shipment.simulation?.enabled &&
        !order.shipment.simulation?.completedAt)
    ) {
      scheduleSandboxSimulation(order);
      await order.save();
    }
    return { order, replayed: true };
  }

  const destination = await resolveGhnAddress(order.shippingAddress);
  const parcel = parcelFromOrder(order);
  const serviceId = Number(order.shipment.serviceId) || null;
  const serviceTypeId = Number(order.shipment.serviceTypeId) || 2;
  let providerOrder = await findExistingGhnOrder(order.orderCode);
  if (!providerOrder) {
    const body = {
      client_order_code: order.orderCode,
      payment_type_id: 1,
      required_note: "KHONGCHOXEMHANG",
      to_name: order.shippingAddress.fullName,
      to_phone: order.shippingAddress.phone,
      to_address: order.shippingAddress.address,
      to_ward_name: order.shippingAddress.ward,
      to_district_name: order.shippingAddress.district,
      to_province_name: order.shippingAddress.city,
      to_ward_code: destination.wardCode,
      to_district_id: destination.districtId,
      cod_amount:
        order.payment?.method === Order.PAYMENT_METHOD.COD
          ? Math.max(0, Number(order.totalAmount) || 0)
          : 0,
      content: `Sách BookShop - ${order.orderCode}`,
      weight: parcel.weight,
      length: parcel.length,
      width: parcel.width,
      height: parcel.height,
      insurance_value: Math.min(Math.max(Number(order.totalAmount) || 0, 0), 5_000_000),
      note: String(order.note || "").slice(0, 500),
      items: parcel.items,
      ...(serviceId ? { service_id: serviceId } : { service_type_id: serviceTypeId }),
    };
    try {
      providerOrder = await ghnRequest("/v2/shipping-order/create", {
        body,
        includeShop: true,
      });
    } catch (error) {
      providerOrder = await findExistingGhnOrder(order.orderCode);
      if (!providerOrder) throw error;
    }
  }
  const providerOrderCode = String(
    providerOrder?.order_code || providerOrder?.OrderCode || ""
  );
  if (!providerOrderCode) {
    throw shippingError("GHN không trả về mã vận đơn", "GHN_INVALID_RESPONSE", 503);
  }
  order.carrier = "GHN Sandbox";
  order.trackingNumber = providerOrderCode;
  const expected = providerOrder.expected_delivery_time || providerOrder.ExpectedDeliveryTime;
  if (expected && !Number.isNaN(new Date(expected).getTime())) {
    order.estimatedDelivery = new Date(expected);
  }
  order.shipment.providerOrderCode = providerOrderCode;
  order.shipment.providerStatus = String(providerOrder.status || "ready_to_pick");
  order.shipment.externalCreatedAt = order.shipment.externalCreatedAt || new Date();
  scheduleSandboxSimulation(order, { restart: true });
  order.trackingEvents.push({
    status: "CREATED",
    description: "Đã tạo vận đơn GHN Sandbox, chờ mô phỏng lấy hàng",
    at: new Date(),
  });
  await order.save();
  return { order, replayed: false };
}

function getShippingProviders() {
  return [
    {
      id: "ghn",
      name: "GHN",
      environment: "sandbox",
      enabled: isGhnEnabled(),
      description: isGhnEnabled()
        ? "Tạo vận đơn và thời gian giao dự kiến tự động qua GHN Sandbox"
        : "GHN Sandbox chưa được cấu hình",
    },
  ];
}

function calculateSupportShipmentCodAmount(ticket, order) {
  const type = ticket?.resolution?.type;
  if (!["RESHIP", "LOST_IN_TRANSIT_RESHIP"].includes(type)) {
    throw shippingError("Phiếu giao bù không hợp lệ", "INVALID_SUPPORT_SHIPMENT");
  }

  // A normal reship replaces goods from an order that was already delivered;
  // charging again would be a double collection. Only a replacement for a
  // parcel lost before COD collection can carry money due.
  if (type === "RESHIP") return 0;

  const paymentStatus = order?.payment?.status;
  if (paymentStatus === Order.PAYMENT_STATUS.PAID) return 0;
  if (
    order?.payment?.method !== Order.PAYMENT_METHOD.COD ||
    paymentStatus !== Order.PAYMENT_STATUS.UNPAID
  ) {
    throw shippingError(
      "Đơn chưa có trạng thái thanh toán phù hợp để giao lại",
      "INVALID_RESHIP_PAYMENT_STATE"
    );
  }

  const alreadyRefunded = Math.max(
    0,
    Number(order.supportCompensation?.refundedAmount) || 0
  );
  return Math.max(
    0,
    Math.round((Number(order.totalAmount) || 0) - alreadyRefunded)
  );
}

async function createSupportShipment({ ticket, order }) {
  if (
    !ticket ||
    !["RESHIP", "LOST_IN_TRANSIT_RESHIP"].includes(ticket.resolution?.type)
  ) {
    throw shippingError("Phiếu giao bù không hợp lệ", "INVALID_SUPPORT_SHIPMENT");
  }
  if (!order) {
    throw shippingError("Không tìm thấy đơn hàng", "ORDER_NOT_FOUND", 404);
  }
  if (!isGhnEnabled()) {
    throw shippingError("GHN Sandbox chưa được cấu hình", "SHIPPING_NOT_CONFIGURED", 503);
  }

  const codAmount = calculateSupportShipmentCodAmount(ticket, order);
  const clientOrderCode = `${order.orderCode}-SP-${String(ticket._id).slice(-6).toUpperCase()}`;
  let providerOrder = await findExistingGhnOrder(clientOrderCode);
  let replayed = Boolean(providerOrder);
  const items = (ticket.resolution.items || []).map((item) => ({
    bookId: item.book?._id || item.book,
    quantity: item.quantity,
  }));
  const quote = await getGhnQuotes({
    items,
    shippingAddress: order.shippingAddress,
    orderValue: 0,
  });
  const option = quote.options[0];
  const destination = option.destination;
  const books = await Book.find({
    _id: { $in: items.map((item) => item.bookId) },
  })
    .select("title weight dimensions")
    .lean();
  const parcel = packageFromBooks(items, books);

  if (!providerOrder) {
    const declaredValue = Math.min(
      Math.max(
        ticket.resolution.items.reduce(
          (sum, item) => sum + Number(item.unitPrice) * Number(item.quantity),
          0
        ),
        0
      ),
      5_000_000
    );
    const body = {
      client_order_code: clientOrderCode,
      payment_type_id: 1,
      required_note: "KHONGCHOXEMHANG",
      to_name: order.shippingAddress.fullName,
      to_phone: order.shippingAddress.phone,
      to_address: order.shippingAddress.address,
      to_ward_name: order.shippingAddress.ward,
      to_district_name: order.shippingAddress.district,
      to_province_name: order.shippingAddress.city,
      to_ward_code: destination.wardCode,
      to_district_id: destination.districtId,
      cod_amount: codAmount,
      content: `Giao bù BookShop - ${order.orderCode}`,
      weight: parcel.weight,
      length: parcel.length,
      width: parcel.width,
      height: parcel.height,
      insurance_value: declaredValue,
      note: String(ticket.resolution.note || "Giao bù theo yêu cầu hỗ trợ").slice(0, 500),
      items: parcel.items,
      ...(option.serviceId
        ? { service_id: option.serviceId }
        : { service_type_id: option.serviceTypeId || 2 }),
    };
    try {
      providerOrder = await ghnRequest("/v2/shipping-order/create", {
        body,
        includeShop: true,
      });
    } catch (error) {
      providerOrder = await findExistingGhnOrder(clientOrderCode);
      if (!providerOrder) throw error;
      replayed = true;
    }
  }

  // A retry can discover a shipment created by an earlier process. For an
  // unpaid COD order, fail closed unless GHN confirms that existing parcel was
  // configured to collect the same amount; otherwise DELIVERED would turn an
  // uncollected order into PAID.
  if (replayed && codAmount > 0) {
    const providerCod = Number(
      providerOrder?.cod_amount ?? providerOrder?.codAmount
    );
    if (!Number.isFinite(providerCod) || providerCod !== codAmount) {
      throw shippingError(
        "Vận đơn giao lại hiện có không khớp số tiền COD còn phải thu",
        "SUPPORT_SHIPMENT_COD_MISMATCH",
        409
      );
    }
  }

  const trackingNumber = String(
    providerOrder?.order_code || providerOrder?.OrderCode || ""
  );
  if (!trackingNumber) {
    throw shippingError("GHN không trả về mã vận đơn", "GHN_INVALID_RESPONSE", 503);
  }
  const providerEstimate =
    providerOrder.expected_delivery_time || providerOrder.ExpectedDeliveryTime;
  const parsedEstimate = providerEstimate ? new Date(providerEstimate) : null;
  const estimatedDelivery =
    parsedEstimate && !Number.isNaN(parsedEstimate.getTime())
      ? parsedEstimate
      : option.estimatedDelivery
        ? new Date(option.estimatedDelivery)
        : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return {
    provider: "ghn",
    environment: "sandbox",
    carrier: "GHN Sandbox",
    clientOrderCode,
    trackingNumber,
    codAmount,
    estimatedDelivery,
    providerStatus: String(providerOrder.status || "ready_to_pick"),
  };
}

async function cancelGhnShipmentAtProvider(order) {
  if (!order?.shipment?.providerOrderCode || order.shipment.provider !== "ghn") {
    return false;
  }
  if (order.shipment.cancelledAt) return false;
  try {
    await ghnRequest("/v2/switch-status/cancel", {
      body: { order_codes: [order.shipment.providerOrderCode] },
      includeShop: true,
    });
  } catch (cancelError) {
    try {
      const detail = await ghnRequest("/v2/shipping-order/detail-by-client-code", {
        body: { client_order_code: order.orderCode },
      });
      const providerStatus = String(detail?.status || detail?.Status || "")
        .trim()
        .toLowerCase();
      if (!["cancel", "cancelled"].includes(providerStatus)) {
        throw cancelError;
      }
    } catch {
      throw cancelError;
    }
  }
  return true;
}

async function cancelGhnShipment(order) {
  const changed = await cancelGhnShipmentAtProvider(order);
  if (!changed) return order;
  order.shipment.providerStatus = "cancel";
  order.shipment.cancelledAt = new Date();
  order.shipment.simulation.enabled = false;
  order.shipment.simulation.nextAt = null;
  order.trackingEvents.push({
    status: "CANCELLED",
    description: "Đã hủy vận đơn GHN Sandbox",
    at: new Date(),
  });
  await order.save();
  return order;
}

function webhookEventKey(payload) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        payload?.OrderCode,
        payload?.ClientOrderCode,
        payload?.Status,
        payload?.Type,
        payload?.UpdatedDate || payload?.Time,
      ])
    )
    .digest("hex");
}

async function verifyGhnWebhook(payload = {}) {
  const providerOrderCode = String(
    payload.OrderCode || payload.order_code || ""
  ).trim();
  const clientOrderCode = String(
    payload.ClientOrderCode || payload.client_order_code || ""
  ).trim();
  if (!providerOrderCode && !clientOrderCode) {
    throw shippingError("Webhook GHN thiếu mã đơn", "INVALID_GHN_WEBHOOK");
  }

  const order = await Order.findOne({
    $or: [
      ...(providerOrderCode
        ? [{ "shipment.providerOrderCode": providerOrderCode }]
        : []),
      ...(clientOrderCode ? [{ orderCode: clientOrderCode }] : []),
    ],
  });
  if (!order) {
    throw shippingError("Không tìm thấy đơn GHN", "GHN_ORDER_NOT_FOUND", 404);
  }
  if (
    order.shipment?.provider !== "ghn" ||
    order.shipment?.environment !== "sandbox" ||
    !order.shipment?.providerOrderCode ||
    (providerOrderCode &&
      providerOrderCode !== String(order.shipment.providerOrderCode)) ||
    (clientOrderCode && clientOrderCode !== String(order.orderCode))
  ) {
    throw shippingError(
      "Webhook không khớp với vận đơn GHN",
      "GHN_WEBHOOK_ORDER_MISMATCH",
      403
    );
  }

  const detail = await ghnRequest("/v2/shipping-order/detail-by-client-code", {
    body: { client_order_code: order.orderCode },
  });
  const verifiedProviderCode = String(
    detail?.order_code || detail?.OrderCode || ""
  ).trim();
  const verifiedClientCode = String(
    detail?.client_order_code || detail?.ClientOrderCode || order.orderCode
  ).trim();
  const verifiedShopId = Number(detail?.shop_id || detail?.ShopID || 0);
  const verifiedStatus = String(detail?.status || detail?.Status || "")
    .trim()
    .toLowerCase();
  if (
    verifiedProviderCode !== String(order.shipment.providerOrderCode) ||
    verifiedClientCode !== String(order.orderCode) ||
    (verifiedShopId && verifiedShopId !== Number(ghnConfig().shopId)) ||
    !verifiedStatus
  ) {
    throw shippingError(
      "GHN trả về thông tin vận đơn không khớp",
      "GHN_WEBHOOK_VERIFICATION_FAILED",
      403
    );
  }

  return {
    OrderCode: verifiedProviderCode,
    ClientOrderCode: verifiedClientCode,
    ShopID: verifiedShopId || Number(ghnConfig().shopId),
    Status: verifiedStatus,
    Type: "Verified_status",
    Description: `GHN Sandbox status: ${verifiedStatus}`,
    UpdatedDate:
      detail?.updated_date ||
      detail?.UpdatedDate ||
      detail?.modified_date ||
      "",
  };
}

async function syncGhnWebhook(payload = {}) {
  const providerOrderCode = String(payload.OrderCode || payload.order_code || "").trim();
  const clientOrderCode = String(
    payload.ClientOrderCode || payload.client_order_code || ""
  ).trim();
  if (!providerOrderCode && !clientOrderCode) {
    throw shippingError("Webhook GHN thiếu mã đơn", "INVALID_GHN_WEBHOOK");
  }
  let order = await Order.findOne({
    $or: [
      ...(providerOrderCode
        ? [{ "shipment.providerOrderCode": providerOrderCode }]
        : []),
      ...(clientOrderCode ? [{ orderCode: clientOrderCode }] : []),
    ],
  });
  if (!order) return { found: false, duplicate: false };
  if (
    order.shipment?.provider !== "ghn" ||
    order.shipment?.environment !== "sandbox" ||
    (providerOrderCode &&
      order.shipment?.providerOrderCode &&
      providerOrderCode !== String(order.shipment.providerOrderCode)) ||
    (clientOrderCode && clientOrderCode !== String(order.orderCode))
  ) {
    throw shippingError(
      "Webhook không khớp với vận đơn GHN",
      "GHN_WEBHOOK_ORDER_MISMATCH",
      403
    );
  }

  const status = String(payload.Status || payload.status || "unknown")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  const orderService = require("./orderService");
  const transitionSafely = async (work) => {
    try {
      return await work();
    } catch (error) {
      if (
        error.code === "INVALID_TRANSITION" ||
        /invalid state transition|status\s*=/i.test(error.message)
      ) {
        return Order.findById(order._id);
      }
      throw error;
    }
  };
  if (IN_TRANSIT_STATUSES.has(status) && order.status === Order.STATUS.PROCESSING) {
    order = await transitionSafely(() =>
      orderService.adminMarkShipped(order._id, "carrier:ghn-sandbox", {
        carrier: "GHN Sandbox",
        trackingNumber: providerOrderCode || order.trackingNumber,
        estimatedDelivery: payload.ExpectedDeliveryTime || null,
      })
    );
  }
  if (DELIVERED_STATUSES.has(status)) {
    if (order.status === Order.STATUS.PROCESSING) {
      order = await transitionSafely(() =>
        orderService.adminMarkShipped(order._id, "carrier:ghn-sandbox", {
          carrier: "GHN Sandbox",
          trackingNumber: providerOrderCode || order.trackingNumber,
        })
      );
    }
    if (order.status === Order.STATUS.SHIPPED) {
      order = await transitionSafely(() =>
        orderService.adminMarkDelivered(order._id, "carrier:ghn-sandbox")
      );
    }
  }

  const eventKey = webhookEventKey(payload);
  const eventAtValue = payload.UpdatedDate || payload.Time || new Date();
  const eventAt = Number.isNaN(new Date(eventAtValue).getTime())
    ? new Date()
    : new Date(eventAtValue);
  const result = await Order.updateOne(
    { _id: order._id, "trackingEvents.providerEventKey": { $ne: eventKey } },
    {
      $set: {
        carrier: "GHN Sandbox",
        ...(providerOrderCode ? { trackingNumber: providerOrderCode } : {}),
        "shipment.provider": "ghn",
        "shipment.environment": "sandbox",
        ...(providerOrderCode
          ? { "shipment.providerOrderCode": providerOrderCode }
          : {}),
        "shipment.providerStatus": status,
        "shipment.lastWebhookAt": new Date(),
      },
      $push: {
        trackingEvents: {
          status: status.toUpperCase(),
          description: String(payload.Description || payload.description || status).slice(
            0,
            500
          ),
          location: String(
            payload.CurrentWarehouseName || payload.current_warehouse_name || ""
          ).slice(0, 200),
          providerEventKey: eventKey,
          at: eventAt,
        },
      },
    }
  );
  return { found: true, duplicate: result.modifiedCount === 0 };
}

function assertSandboxSimulationOrder(order) {
  if (!order) {
    throw shippingError("Không tìm thấy đơn hàng", "ORDER_NOT_FOUND", 404);
  }
  if (
    order.shipment?.provider !== "ghn" ||
    order.shipment?.environment !== "sandbox" ||
    !order.shipment?.providerOrderCode
  ) {
    throw shippingError(
      "Đơn hàng chưa có vận đơn GHN Sandbox",
      "NOT_GHN_SANDBOX_ORDER"
    );
  }
  if (order.shipment.cancelledAt) {
    throw shippingError("Vận đơn Sandbox đã bị hủy", "SHIPMENT_CANCELLED");
  }
}

async function advanceSandboxSimulation(
  orderId,
  { force = false, now = new Date() } = {}
) {
  const current = await Order.findById(orderId);
  assertSandboxSimulationOrder(current);
  const stepIndex = Number(current.shipment.simulation?.step) || 0;
  const step = SANDBOX_SIMULATION_STEPS[stepIndex];
  if (!step) {
    current.shipment.simulation.enabled = false;
    current.shipment.simulation.nextAt = null;
    current.shipment.simulation.completedAt ||= now;
    await current.save();
    return { order: current, advanced: false, completed: true };
  }

  const claimFilter = {
    _id: current._id,
    "shipment.environment": "sandbox",
    "shipment.cancelledAt": null,
    "shipment.simulation.step": stepIndex,
  };
  if (!force) {
    claimFilter["shipment.simulation.enabled"] = true;
    claimFilter["shipment.simulation.nextAt"] = { $lte: now };
  }
  const lockUntil = new Date(
    now.getTime() + Math.max(30_000, ghnConfig().simulation.stepDelayMs * 2)
  );
  const claimed = await Order.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        "shipment.simulation.nextAt": lockUntil,
        "shipment.simulation.lastError": "",
      },
    },
    { returnDocument: "after" }
  );
  if (!claimed) {
    return { order: current, advanced: false, completed: false };
  }

  const continueAutomatically = Boolean(claimed.shipment.simulation.enabled);
  try {
    await syncGhnWebhook({
      OrderCode: claimed.shipment.providerOrderCode,
      ClientOrderCode: claimed.orderCode,
      Status: step.status,
      Type: "Sandbox_simulation",
      Description: step.description,
      CurrentWarehouseName: "Kho mô phỏng GHN Sandbox",
      Time: now.toISOString(),
    });
    const nextStep = stepIndex + 1;
    const completed = nextStep >= SANDBOX_SIMULATION_STEPS.length;
    await Order.updateOne(
      {
        _id: claimed._id,
        "shipment.simulation.step": stepIndex,
      },
      {
        $set: {
          "shipment.simulation.step": nextStep,
          "shipment.simulation.enabled": completed
            ? false
            : continueAutomatically,
          "shipment.simulation.nextAt":
            completed || !continueAutomatically
              ? null
              : new Date(now.getTime() + ghnConfig().simulation.stepDelayMs),
          "shipment.simulation.completedAt": completed ? now : null,
          "shipment.simulation.lastError": "",
        },
      }
    );
    return {
      order: await Order.findById(claimed._id),
      advanced: true,
      completed,
      status: step.status,
    };
  } catch (error) {
    await Order.updateOne(
      { _id: claimed._id },
      {
        $set: {
          "shipment.simulation.nextAt": continueAutomatically
            ? new Date(now.getTime() + ghnConfig().simulation.stepDelayMs)
            : null,
          "shipment.simulation.lastError": String(error.message || error).slice(
            0,
            500
          ),
        },
      }
    );
    throw error;
  }
}

async function controlSandboxSimulation(orderId, action) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  if (normalizedAction === "advance") {
    return advanceSandboxSimulation(orderId, { force: true });
  }
  if (!["pause", "resume"].includes(normalizedAction)) {
    throw shippingError(
      "Hành động mô phỏng không hợp lệ",
      "INVALID_SIMULATION_ACTION"
    );
  }
  const order = await Order.findById(orderId);
  assertSandboxSimulationOrder(order);
  if (order.status === Order.STATUS.DELIVERED) {
    throw shippingError("Đơn hàng đã giao thành công", "SIMULATION_COMPLETED");
  }
  const enabled = normalizedAction === "resume";
  order.shipment.simulation.enabled = enabled;
  order.shipment.simulation.nextAt = enabled
    ? new Date(Date.now() + ghnConfig().simulation.stepDelayMs)
    : null;
  order.shipment.simulation.lastError = "";
  await order.save();
  return { order, action: normalizedAction };
}

async function processDueSandboxSimulations({ limit = 20 } = {}) {
  if (!ghnConfig().simulation.enabled) return { processed: 0, failed: 0 };
  const now = new Date();
  const due = await Order.find({
    "shipment.environment": "sandbox",
    "shipment.cancelledAt": null,
    "shipment.simulation.enabled": true,
    "shipment.simulation.nextAt": { $lte: now },
    status: { $in: [Order.STATUS.PROCESSING, Order.STATUS.SHIPPED] },
  })
    .select("_id")
    .limit(Math.max(1, Math.min(Number(limit) || 20, 100)))
    .lean();
  let processed = 0;
  let failed = 0;
  for (const item of due) {
    try {
      const result = await advanceSandboxSimulation(item._id, { now });
      if (result.advanced) processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}

module.exports = {
  SANDBOX_SIMULATION_STEPS,
  advanceSandboxSimulation,
  cancelGhnShipment,
  cancelGhnShipmentAtProvider,
  controlSandboxSimulation,
  createGhnShipment,
  createSupportShipment,
  calculateSupportShipmentCodAmount,
  getShippingProviders,
  getShippingQuotes,
  isGhnEnabled,
  processDueSandboxSimulations,
  resolveShippingSelection,
  syncGhnWebhook,
  verifyGhnWebhook,
};
