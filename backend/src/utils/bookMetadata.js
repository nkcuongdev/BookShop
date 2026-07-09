function normalizeEntityName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function entityKey(value) {
  return normalizeEntityName(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN");
}

function normalizeIsbn(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");
}

function isValidIsbn10(value) {
  if (!/^\d{9}[\dX]$/.test(value)) return false;
  const sum = [...value].reduce((total, character, index) => {
    const digit = character === "X" ? 10 : Number(character);
    return total + digit * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

function isValidIsbn13(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const expected = Number(value[12]);
  const sum = value
    .slice(0, 12)
    .split("")
    .reduce(
      (total, character, index) =>
        total + Number(character) * (index % 2 === 0 ? 1 : 3),
      0
    );
  return (10 - (sum % 10)) % 10 === expected;
}

function isValidIsbn(value) {
  const normalized = normalizeIsbn(value);
  if (!normalized) return true;
  return normalized.length === 10
    ? isValidIsbn10(normalized)
    : normalized.length === 13 && isValidIsbn13(normalized);
}

module.exports = {
  entityKey,
  isValidIsbn,
  normalizeEntityName,
  normalizeIsbn,
};
