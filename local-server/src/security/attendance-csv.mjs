import { createHash } from "node:crypto";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS = 5000;
const MAX_COLUMNS = 40;
const MAX_FIELD_LENGTH = 500;

export class AttendanceCsvError extends Error {
  constructor(message) {
    super(message);
    this.name = "AttendanceCsvError";
    this.status = 400;
  }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isBlankRow(row) {
  return row.every(value => value.trim() === "");
}

function parseRecords(csvText) {
  const input = csvText.startsWith("\uFEFF") ? csvText.slice(1) : csvText;
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  function pushField() {
    if (field.length > MAX_FIELD_LENGTH) throw new AttendanceCsvError("A CSV field exceeds 500 characters.");
    record.push(field);
    field = "";
    afterQuote = false;
    if (record.length > MAX_COLUMNS) throw new AttendanceCsvError("The CSV contains more than 40 columns.");
  }

  function pushRecord() {
    pushField();
    if (!isBlankRow(record)) {
      records.push(record);
      if (records.length > MAX_RECORDS + 1) {
        throw new AttendanceCsvError("A single import cannot contain more than 5,000 data rows.");
      }
    }
    record = [];
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "\u0000") throw new AttendanceCsvError("The CSV contains a forbidden NUL character.");

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      if (field.length > MAX_FIELD_LENGTH) throw new AttendanceCsvError("A CSV field exceeds 500 characters.");
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        pushField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && input[index + 1] === "\n") index += 1;
        pushRecord();
      } else if (character === " " || character === "\t") {
        // Allow harmless spaces after a quoted field.
      } else {
        throw new AttendanceCsvError("Unexpected content after a closing CSV quote.");
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new AttendanceCsvError("A quote may only begin a quoted CSV field.");
    } else if (character === ",") {
      pushField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      pushRecord();
    } else {
      field += character;
      if (field.length > MAX_FIELD_LENGTH) throw new AttendanceCsvError("A CSV field exceeds 500 characters.");
    }
  }

  if (quoted) throw new AttendanceCsvError("The CSV contains an unterminated quoted field.");
  if (field.length > 0 || record.length > 0 || afterQuote) pushRecord();
  if (records.length < 2) throw new AttendanceCsvError("The CSV must contain a header and at least one data row.");
  return records;
}

function parseTimestamp(value) {
  const text = value.trim();
  const local = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  const zoned = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/i);
  let iso = text;
  const match = local || zoned;
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) ||
      calendar.getUTCMonth() !== Number(month) - 1 ||
      calendar.getUTCDate() !== Number(day) ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (local) {
    const fraction = local[7] || "";
    iso = year + "-" + month + "-" + day + "T" + hour + ":" + minute + ":" +
      second + (fraction ? "." + fraction.padEnd(3, "0") : "") + "+03:00";
  } else if (zoned[8]) {
    const offsetHour = Number(zoned[9]), offsetMinute = Number(zoned[10]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const timestamp = new Date(iso);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

function normalizeEventType(value) {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["in", "clock in", "check in", "checkin", "entry", "punch in", "fingerprint in"].includes(normalized)) return "Clock In";
  if (["out", "clock out", "check out", "checkout", "exit", "punch out", "fingerprint out"].includes(normalized)) return "Clock Out";
  if (["break start", "start break", "break out"].includes(normalized)) return "Break Start";
  if (["break end", "end break", "break in"].includes(normalized)) return "Break End";
  if (normalized === "" || normalized === "unknown") return "Unknown";
  return "Unknown";
}

function normalizeHeader(value) {
  return value.trim().replace(/^\uFEFF/, "").toLocaleLowerCase("en-US");
}

function chooseColumn(header, value, label, required) {
  if (value == null || value === "") {
    if (required) throw new AttendanceCsvError("Select the CSV column for " + label + ".");
    return null;
  }
  const normalized = normalizeHeader(String(value));
  const index = header.indexOf(normalized);
  if (index < 0) throw new AttendanceCsvError("The selected " + label + " column is not present in the CSV header.");
  return index;
}

export function parseAttendanceCsv(csvText, columns) {
  if (typeof csvText !== "string" || csvText.length === 0) {
    throw new AttendanceCsvError("Choose a non-empty CSV file.");
  }
  if (Buffer.byteLength(csvText, "utf8") > MAX_BYTES) {
    throw new AttendanceCsvError("Attendance CSV files must be 2 MB or smaller.");
  }
  if (!columns || typeof columns !== "object" || Array.isArray(columns)) {
    throw new AttendanceCsvError("Choose the CSV column mapping.");
  }

  const records = parseRecords(csvText);
  const header = records[0].map(normalizeHeader);
  if (header.some(value => value.length === 0)) throw new AttendanceCsvError("The CSV header contains an empty column name.");
  if (new Set(header).size !== header.length) throw new AttendanceCsvError("CSV header names must be unique.");

  const staffIndex = chooseColumn(header, columns.staffIdentifier, "staff identifier", true);
  const timestampIndex = chooseColumn(header, columns.occurredAt, "event date and time", true);
  const typeIndex = chooseColumn(header, columns.eventType, "event type", false);
  const externalIdIndex = chooseColumn(header, columns.externalEventId, "event identifier", false);

  const result = [];
  for (let index = 1; index < records.length; index += 1) {
    const values = records[index];
    const rowNumber = index + 1;
    const sourceRowSha256 = sha256(values.join("\u001f"));
    const reject = (reasonCode, reason) => result.push({
      rowNumber, sourceRowSha256, error: { reasonCode, reason }
    });

    if (values.length > header.length) {
      reject("invalid_column_count", "This row contains more columns than the CSV header.");
      continue;
    }
    const field = columnIndex => columnIndex == null ? "" : (values[columnIndex] ?? "").trim();
    const staffIdentifier = field(staffIndex);
    const timestamp = parseTimestamp(field(timestampIndex));
    if (!staffIdentifier || staffIdentifier.length > 80) {
      reject("invalid_staff_identifier", "A staff identifier is missing or exceeds 80 characters.");
      continue;
    }
    if (!timestamp) {
      reject("invalid_timestamp", "The event time is invalid. Use an ISO 8601 timestamp or Uganda local YYYY-MM-DD HH:mm:ss.");
      continue;
    }
    const eventType = normalizeEventType(field(typeIndex));
    const externalEventId = field(externalIdIndex);
    if (externalEventId.length > 200) {
      reject("invalid_event_identifier", "The terminal event identifier exceeds 200 characters.");
      continue;
    }
    result.push({
      rowNumber,
      sourceRowSha256,
      staffIdentifier,
      occurredAt: timestamp,
      eventType,
      externalEventId: externalEventId || null
    });
  }
  if (result.length === 0) throw new AttendanceCsvError("The CSV contains no attendance rows to import.");
  return result;
}
