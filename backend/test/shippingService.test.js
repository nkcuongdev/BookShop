const assert = require("node:assert/strict");
const test = require("node:test");
const Book = require("../src/models/Book");
const config = require("../src/config");
const shippingService = require("../src/services/shippingService");

test("GHN gateway is permanently locked to Sandbox", () => {
  assert.equal(
    config.shipping.ghn.baseUrl,
    "https://dev-online-gateway.ghn.vn/shiip/public-api"
  );
  assert.equal(config.shipping.ghn.environment, "sandbox");
});

function response(data) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ code: 200, message: "Success", data }),
  };
}

test("shipping quotes fail closed when GHN Sandbox is not configured", async () => {
  const current = { ...config.shipping.ghn };
  Object.assign(config.shipping.ghn, { enabled: false, token: "", shopId: 0 });
  try {
    await assert.rejects(
      shippingService.getShippingQuotes({}),
      (error) =>
        error.code === "SHIPPING_NOT_CONFIGURED" && error.statusCode === 503
    );
  } finally {
    Object.assign(config.shipping.ghn, current);
  }
});

test("GHN quotes resolve provider address codes and use server-side book metrics", async () => {
  const currentConfig = { ...config.shipping.ghn };
  const originalFetch = global.fetch;
  const originalFind = Book.find;
  const requests = [];
  Object.assign(config.shipping.ghn, {
    enabled: true,
    baseUrl: "https://dev-online-gateway.ghn.vn/shiip/public-api",
    token: "secret-token",
    shopId: 123,
    fromDistrictId: 0,
    fromWardCode: "",
    requestTimeoutMs: 1_000,
  });
  Book.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [
        {
          _id: "64b64c000000000000000001",
          title: "Clean Code",
          weight: 450,
          dimensions: { length: 24, width: 16, height: 3 },
        },
      ];
    },
  });
  global.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, options, body });
    if (url.endsWith("/master-data/province")) {
      return response([
        {
          ProvinceID: 2002,
          ProvinceName: "Hà Nội 02",
          NameExtension: ["Hà Nội"],
        },
        { ProvinceID: 201, ProvinceName: "Hà Nội" },
      ]);
    }
    if (url.endsWith("/master-data/district")) {
      assert.equal(body.province_id, 201);
      return response([{ DistrictID: 1442, DistrictName: "Quận Ba Đình" }]);
    }
    if (url.endsWith("/master-data/ward")) {
      assert.equal(body.district_id, 1442);
      return response([{ WardCode: "21012", WardName: "Phường Điện Biên" }]);
    }
    if (url.endsWith("/v2/shipping-order/fee")) {
      assert.equal(body.to_district_id, 1442);
      assert.equal(body.to_ward_code, "21012");
      assert.equal(body.weight, 900);
      assert.equal(body.height, 6);
      assert.equal(options.headers.Token, "secret-token");
      assert.equal(options.headers.ShopId, "123");
      return response({ total: 32_500 });
    }
    throw new Error(`Unexpected GHN request: ${url}`);
  };

  try {
    const result = await shippingService.getShippingQuotes({
      items: [{ bookId: "64b64c000000000000000001", quantity: 2 }],
      shippingAddress: {
        city: "Thành phố Hà Nội",
        district: "Ba Đình",
        ward: "Điện Biên",
      },
    });
    assert.equal(result.source, "sandbox", JSON.stringify({ result, requests }));
    assert.equal(result.environment, "sandbox");
    assert.equal(result.options.length, 1);
    assert.equal(result.options[0].id, "ghn:type-2");
    assert.equal(result.options[0].fee, 32_500);
    assert.ok(requests.some((request) => request.url.endsWith("/fee")));
  } finally {
    global.fetch = originalFetch;
    Book.find = originalFind;
    Object.assign(config.shipping.ghn, currentConfig);
  }
});

test("GHN automatically quotes only the parcel class matching chargeable weight", async () => {
  const currentConfig = { ...config.shipping.ghn };
  const originalFetch = global.fetch;
  const originalFind = Book.find;
  Object.assign(config.shipping.ghn, {
    enabled: true,
    baseUrl: "https://dev-online-gateway.ghn.vn/shiip/public-api",
    token: "secret-token",
    shopId: 123,
    fromDistrictId: 1450,
    fromWardCode: "21001",
    requestTimeoutMs: 1_000,
  });
  Book.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [
        {
          _id: "64b64c000000000000000001",
          title: "Clean Code",
          weight: 21_000,
          dimensions: { length: 24, width: 16, height: 3 },
        },
      ];
    },
  });
  global.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith("/master-data/province")) {
      return response([{ ProvinceID: 201, ProvinceName: "Hà Nội" }]);
    }
    if (url.endsWith("/master-data/district")) {
      return response([{ DistrictID: 1442, DistrictName: "Quận Ba Đình" }]);
    }
    if (url.endsWith("/master-data/ward")) {
      return response([{ WardCode: "21012", WardName: "Phường Điện Biên" }]);
    }
    if (url.endsWith("/v2/shipping-order/available-services")) {
      return response([
        { service_id: 101, service_type_id: 2, short_name: "Hàng nhẹ" },
        { service_id: 102, service_type_id: 5, short_name: "Hàng nặng" },
      ]);
    }
    if (url.endsWith("/v2/shipping-order/fee")) {
      assert.equal(body.service_id, 102);
      const fees = { 102: 150_000 };
      return response({ total: fees[body.service_id] });
    }
    if (url.endsWith("/v2/shipping-order/leadtime")) {
      return response({ leadtime: 1_800_000_000 });
    }
    throw new Error(`Unexpected GHN request: ${url}`);
  };

  try {
    const result = await shippingService.getShippingQuotes({
      items: [{ bookId: "64b64c000000000000000001", quantity: 1 }],
      shippingAddress: {
        city: "Hà Nội",
        district: "Ba Đình",
        ward: "Điện Biên",
      },
    });
    assert.deepEqual(
      result.options.map(({ method, title, fee, serviceTypeId }) => ({
        method,
        title,
        fee,
        serviceTypeId,
      })),
      [
        {
          method: "standard",
          title: "Giao hàng GHN",
          fee: 150_000,
          serviceTypeId: 5,
        },
      ]
    );
  } finally {
    global.fetch = originalFetch;
    Book.find = originalFind;
    Object.assign(config.shipping.ghn, currentConfig);
  }
});
