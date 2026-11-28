// CORNHILL V49: a strictly per-learner Nursery materials-receiving contract.
// Draft-stage, pure validation and summary logic. No database or payment side effects.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEYS = new Set(["learnerId", "requestId", "materialName", "quantityReceived", "receivedDate", "notes"]);

function validUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(label + " must be a valid UUID.");
  return value.toLowerCase();
}
function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2200) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() + 1 === month && candidate.getUTCDate() === day;
}
function cleanText(value, label, max, required = true) {
  if (!required && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string") throw new TypeError(label + " must be text.");
  const text = value.trim().normalize("NFC");
  if ((required && text.length < 2) || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new TypeError(label + " has invalid length or control characters.");
  }
  return text || null;
}

export function validateNurseryMaterialCollection(input) {
  if (!plainObject(input)) throw new TypeError("A single learner's materials record is required.");
  // Refuse bulk/class operations and actor identifiers supplied by browsers.
  for (const key of Object.keys(input)) {
    if (!SAFE_KEYS.has(key)) throw new TypeError("Unrecognized collection field: " + key);
  }
  const learnerId = validUuid(input.learnerId, "learnerId");
  const requestId = validUuid(input.requestId, "requestId");
  const materialName = cleanText(input.materialName, "Material name", 100);
  if (!Number.isSafeInteger(input.quantityReceived) ||
      input.quantityReceived < 1 || input.quantityReceived > 1000) {
    throw new TypeError("Received quantity must be a whole number from 1 to 1000.");
  }
  if (!calendarDate(input.receivedDate)) {
    throw new TypeError("Collection date must be a valid YYYY-MM-DD date.");
  }
  return Object.freeze({
    learnerId, requestId, materialName,
    quantityReceived: input.quantityReceived,
    receivedDate: input.receivedDate,
    notes: cleanText(input.notes, "Notes", 300, false)
  });
}

export function summarizeNurseryMaterialCollections(learnerId, records) {
  const id = validUuid(learnerId, "learnerId");
  if (!Array.isArray(records)) throw new TypeError("Collection records must be an array.");
  const byMaterial = new Map(), seen = new Set();
  for (const row of records) {
    const item = validateNurseryMaterialCollection(row);
    if (item.learnerId !== id) throw new TypeError("Cannot combine different learners' collection records.");
    if (seen.has(item.requestId)) throw new TypeError("Repeated collection request ID; review before counting.");
    seen.add(item.requestId);
    const key = item.materialName.toLocaleLowerCase("en");
    const previous = byMaterial.get(key);
    if (previous) {
      previous.quantityReceived += item.quantityReceived;
      previous.collectionEvents += 1;
    } else {
      byMaterial.set(key, {materialName: item.materialName,
        quantityReceived: item.quantityReceived, collectionEvents: 1});
    }
  }
  return Object.freeze({learnerId: id, collectionEvents: records.length,
    materials: [...byMaterial.values()].sort((a, b) => a.materialName.localeCompare(b.materialName, "en"))});
}
