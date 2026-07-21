import { useEffect, useRef, useState } from "react";
import { CircleAlert, Keyboard, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { vietnamAdministrativeAPI } from "@/services/vietnamAdministrative";

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findByName(units, name) {
  const normalized = normalizeName(name);
  return normalized
    ? units.find((unit) => normalizeName(unit.name) === normalized) || null
    : null;
}

function NativeSelect({ id, label, value, onChange, options, disabled, loading, error }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || loading}
        className={cn(
          "flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground/70",
          error && "border-danger-strong/40"
        )}
      >
        <option value="">{loading ? "Đang tải..." : `Chọn ${label.toLowerCase()}`}</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger-strong">{error}</p>}
    </div>
  );
}

export default function VietnamAdministrativeFields({
  value,
  onChange,
  errors = {},
  idPrefix = "administrative",
  requireLegacy = false,
}) {
  const [mode, setMode] = useState("catalog");
  // GHN's master data is still the pre-07/2025 three-level catalogue, so any
  // form that feeds a shipping quote must collect province/district/ward.
  const [version, setVersion] = useState(
    requireLegacy || value?.district ? "legacy" : "current"
  );
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [provinceCode, setProvinceCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [loadError, setLoadError] = useState("");
  const provinceRequestIdRef = useRef(0);
  const childRequestIdRef = useRef(0);
  const wardRequestIdRef = useRef(0);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const updateValue = (patch) => onChange?.({ ...value, ...patch });

  useEffect(() => {
    if (mode !== "catalog") return undefined;
    const requestId = ++provinceRequestIdRef.current;
    const timer = window.setTimeout(async () => {
      setLoadingProvinces(true);
      setLoadError("");
      try {
        const nextProvinces = await vietnamAdministrativeAPI.getProvinces(version);
        if (requestId !== provinceRequestIdRef.current) return;
        setProvinces(nextProvinces);
        setProvinceCode(
          findByName(nextProvinces, valueRef.current?.city)?.code || ""
        );
      } catch (error) {
        if (requestId !== provinceRequestIdRef.current) return;
        setLoadError(error.message || "Không thể tải danh mục hành chính");
        setMode("manual");
      } finally {
        if (requestId === provinceRequestIdRef.current) {
          setLoadingProvinces(false);
        }
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      provinceRequestIdRef.current += 1;
    };
  }, [mode, version]);

  useEffect(() => {
    if (mode !== "catalog" || !provinceCode) {
      return undefined;
    }
    const requestId = ++childRequestIdRef.current;
    const timer = window.setTimeout(async () => {
      setLoadingChildren(true);
      try {
        if (version === "legacy") {
          const nextDistricts =
            await vietnamAdministrativeAPI.getDistricts(provinceCode);
          if (requestId !== childRequestIdRef.current) return;
          setDistricts(nextDistricts);
          setDistrictCode(
            findByName(nextDistricts, valueRef.current?.district)?.code || ""
          );
          setWards([]);
          setWardCode("");
        } else {
          const nextWards = await vietnamAdministrativeAPI.getWards({
            version,
            provinceCode,
          });
          if (requestId !== childRequestIdRef.current) return;
          setWards(nextWards);
          setWardCode(
            findByName(nextWards, valueRef.current?.ward)?.code || ""
          );
          setDistricts([]);
          setDistrictCode("");
        }
      } catch (error) {
        if (requestId !== childRequestIdRef.current) return;
        setLoadError(error.message || "Không thể tải đơn vị hành chính");
        setMode("manual");
      } finally {
        if (requestId === childRequestIdRef.current) setLoadingChildren(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      childRequestIdRef.current += 1;
    };
  }, [mode, provinceCode, version]);

  useEffect(() => {
    if (mode !== "catalog" || version !== "legacy" || !districtCode) {
      return undefined;
    }
    const requestId = ++wardRequestIdRef.current;
    const timer = window.setTimeout(async () => {
      setLoadingChildren(true);
      try {
        const nextWards = await vietnamAdministrativeAPI.getWards({
          version,
          districtCode,
        });
        if (requestId !== wardRequestIdRef.current) return;
        setWards(nextWards);
        setWardCode(
          findByName(nextWards, valueRef.current?.ward)?.code || ""
        );
      } catch (error) {
        if (requestId !== wardRequestIdRef.current) return;
        setLoadError(error.message || "Không thể tải phường/xã");
        setMode("manual");
      } finally {
        if (requestId === wardRequestIdRef.current) setLoadingChildren(false);
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      wardRequestIdRef.current += 1;
    };
  }, [districtCode, mode, version]);

  const changeVersion = (nextVersion) => {
    if (requireLegacy || nextVersion === version) return;
    provinceRequestIdRef.current += 1;
    childRequestIdRef.current += 1;
    wardRequestIdRef.current += 1;
    setVersion(nextVersion);
    setProvinces([]);
    setDistricts([]);
    setWards([]);
    setProvinceCode("");
    setDistrictCode("");
    setWardCode("");
    updateValue({ city: "", district: "", ward: "" });
  };

  const changeProvince = (code) => {
    const province = provinces.find((item) => item.code === code);
    childRequestIdRef.current += 1;
    wardRequestIdRef.current += 1;
    setProvinceCode(code);
    setDistrictCode("");
    setWardCode("");
    setDistricts([]);
    setWards([]);
    updateValue({ city: province?.name || "", district: "", ward: "" });
  };

  const changeDistrict = (code) => {
    const district = districts.find((item) => item.code === code);
    wardRequestIdRef.current += 1;
    setDistrictCode(code);
    setWardCode("");
    setWards([]);
    updateValue({ district: district?.name || "", ward: "" });
  };

  const changeWard = (code) => {
    const ward = wards.find((item) => item.code === code);
    setWardCode(code);
    updateValue({ ward: ward?.name || "" });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Địa chỉ hành chính Việt Nam
          </p>
          <p className="text-xs text-muted-foreground">
            Chọn từ danh mục để chuẩn hóa, hoặc nhập tự do nếu cần.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-primary"
          onClick={() => {
            setLoadError("");
            setMode((current) => (current === "catalog" ? "manual" : "catalog"));
          }}
        >
          {mode === "catalog" ? (
            <Keyboard className="size-4" />
          ) : (
            <ListTree className="size-4" />
          )}
          {mode === "catalog" ? "Nhập tự do" : "Chọn từ danh mục"}
        </Button>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-lg bg-warning-muted p-2 text-xs text-warning-strong">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{loadError}. Bạn vẫn có thể nhập địa chỉ thủ công.</span>
        </div>
      )}

      {mode === "catalog" ? (
        <>
          {!requireLegacy && (
            <>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-card p-1 text-xs">
                <button
                  type="button"
                  onClick={() => changeVersion("current")}
                  className={cn(
                    "rounded-md px-2 py-1.5 font-medium transition-colors",
                    version === "current"
                      ? "bg-primary-50 text-primary-700"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Hiện hành · 2 cấp
                </button>
                <button
                  type="button"
                  onClick={() => changeVersion("legacy")}
                  className={cn(
                    "rounded-md px-2 py-1.5 font-medium transition-colors",
                    version === "legacy"
                      ? "bg-primary-50 text-primary-700"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Có quận/huyện · 3 cấp
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {version === "current"
                  ? "Hệ thống hiện hành không còn cấp quận/huyện."
                  : "Danh mục có quận/huyện, dùng được cho đơn vận chuyển."}
              </p>
            </>
          )}
          {requireLegacy && (
            <p className="text-xs text-muted-foreground">
              Đơn vị vận chuyển yêu cầu địa chỉ có quận/huyện, vui lòng chọn đủ
              tỉnh/thành, quận/huyện và phường/xã.
            </p>
          )}
          <div
            className={cn(
              "grid grid-cols-1 gap-3",
              version === "legacy" ? "md:grid-cols-3" : "sm:grid-cols-2"
            )}
          >
            <NativeSelect
              id={`${idPrefix}-city`}
              label="Tỉnh/Thành phố"
              value={provinceCode}
              onChange={changeProvince}
              options={provinces}
              loading={loadingProvinces}
              error={errors.city}
            />
            {version === "legacy" && (
              <NativeSelect
                id={`${idPrefix}-district`}
                label="Quận/Huyện"
                value={districtCode}
                onChange={changeDistrict}
                options={districts}
                disabled={!provinceCode}
                loading={loadingChildren && !!provinceCode && districts.length === 0}
                error={errors.district}
              />
            )}
            <NativeSelect
              id={`${idPrefix}-ward`}
              label="Phường/Xã"
              value={wardCode}
              onChange={changeWard}
              options={wards}
              disabled={
                version === "legacy" ? !districtCode : !provinceCode
              }
              loading={
                loadingChildren &&
                (version === "legacy" ? !!districtCode : !!provinceCode) &&
                wards.length === 0
              }
              error={errors.ward}
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            ["city", "Tỉnh/Thành phố"],
            ["district", requireLegacy ? "Quận/Huyện" : "Quận/Huyện (nếu có)"],
            ["ward", "Phường/Xã"],
          ].map(([field, label]) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-${field}-manual`}>{label}</Label>
              <Input
                id={`${idPrefix}-${field}-manual`}
                value={value?.[field] || ""}
                onChange={(event) => updateValue({ [field]: event.target.value })}
                maxLength={100}
                className={cn(errors[field] && "border-danger-strong/40")}
              />
              {errors[field] && (
                <p className="text-xs text-danger-strong">{errors[field]}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
