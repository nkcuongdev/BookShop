const express = require("express");
const {
  getDistricts,
  getProvinces,
  getWards,
} = require("../services/vietnamAdministrativeService");
const { createRateLimiter } = require("../utils/security");

const router = express.Router();
const limiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyPrefix: "administrative-data",
  message: "Bạn đã tải dữ liệu địa chỉ quá nhiều lần",
});

router.use(limiter);
router.get("/provinces", async (req, res, next) => {
  try {
    const units = await getProvinces(req.query.version);
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return res.json({ success: true, data: { units } });
  } catch (error) {
    return next(error);
  }
});

router.get("/districts", async (req, res, next) => {
  try {
    const units = await getDistricts(req.query.provinceCode);
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return res.json({ success: true, data: { units } });
  } catch (error) {
    return next(error);
  }
});

router.get("/wards", async (req, res, next) => {
  try {
    const units = await getWards(req.query);
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return res.json({ success: true, data: { units } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
