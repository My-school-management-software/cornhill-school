import { createHash } from "node:crypto";
import { parseAttendanceCsv } from "../security/attendance-csv.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(label + " is invalid.");
}
function makeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function rejectionFor(error) {
  if (error?.code === "23505") return { code: "duplicate_event", reason: "This terminal event identifier was already imported." };
  if (error?.code === "23514") return { code: "unmapped_staff", reason: "No active device-to-staff mapping exists for this identifier and event date, or the event failed a database policy check." };
  if (error?.code === "23503") return { code: "missing_reference", reason: "The device or staff reference is no longer available." };
  if (error?.code === "23P01") return { code: "mapping_conflict", reason: "The device staff identifier conflicts with an existing effective mapping." };
  return { code: "event_rejected", reason: "The event could not be accepted by the attendance integrity rules." };
}
function checksum(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function autoEventId({ deviceId, staffIdentifier, occurredAt, eventType }) {
  const digest = checksum([deviceId, staffIdentifier, occurredAt, eventType].join("\u0000"));
  return "AUTO-" + digest;
}

export function createPostgresAttendanceImportRepository(pool) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool with transaction support is required.");
  }

  return Object.freeze({
    async listDevices() {
      const result = await pool.query(
        "SELECT id::text AS id, device_code AS \"deviceCode\", device_name AS \"deviceName\", " +
        "manufacturer, model, serial_number AS \"serialNumber\", connection_type AS \"connectionType\", " +
        "device_location AS \"deviceLocation\", device_status AS status, last_import_at AS \"lastImportAt\", " +
        "created_at AS \"createdAt\" FROM cornhill_school.attendance_devices " +
        "ORDER BY device_name, device_code LIMIT 200"
      );
      return result.rows;
    },

    async listStaffOptions() {
      const result = await pool.query(
        "SELECT sp.staff_account_id::text AS id, sp.staff_number AS \"staffNumber\", " +
        "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", sp.job_title AS \"jobTitle\" " +
        "FROM cornhill_school.staff_profiles sp " +
        "JOIN cornhill_auth.staff_accounts a ON a.id=sp.staff_account_id " +
        "WHERE sp.employment_status='Active' AND a.account_status='active' " +
        "ORDER BY sp.legal_name LIMIT 300"
      );
      return result.rows;
    },

    async listMappings({ deviceId } = {}) {
      if (deviceId != null) assertUuid(deviceId, "Device ID");
      const result = await pool.query(
        "SELECT m.id::text AS id, m.device_id::text AS \"deviceId\", " +
        "m.device_staff_identifier AS \"deviceStaffIdentifier\", " +
        "m.staff_account_id::text AS \"staffId\", sp.staff_number AS \"staffNumber\", " +
        "COALESCE(sp.preferred_name,sp.legal_name) AS \"staffName\", " +
        "m.effective_from::text AS \"effectiveFrom\", m.effective_to::text AS \"effectiveTo\", " +
        "m.is_active AS active, m.created_at AS \"createdAt\" " +
        "FROM cornhill_school.attendance_device_staff_mappings m " +
        "JOIN cornhill_school.staff_profiles sp ON sp.staff_account_id=m.staff_account_id " +
        (deviceId ? "WHERE m.device_id=$1::uuid " : "") +
        "ORDER BY m.device_staff_identifier,m.effective_from DESC LIMIT 1000",
        deviceId ? [deviceId] : []
      );
      return result.rows;
    },

    async createDevice(input) {
      const result = await pool.query(
        "INSERT INTO cornhill_school.attendance_devices " +
        "(device_code,device_name,manufacturer,model,serial_number,connection_type,device_location) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7) " +
        "RETURNING id::text AS id,device_code AS \"deviceCode\",device_name AS \"deviceName\", " +
        "connection_type AS \"connectionType\",device_status AS status",
        [input.deviceCode,input.deviceName,input.manufacturer,input.model,input.serialNumber,input.connectionType,input.deviceLocation]
      );
      return result.rows[0];
    },

    async setDeviceStatus({ deviceId, status }) {
      assertUuid(deviceId, "Device ID");
      const result = await pool.query(
        "UPDATE cornhill_school.attendance_devices SET device_status=$2 " +
        "WHERE id=$1::uuid RETURNING id::text AS id,device_code AS \"deviceCode\", " +
        "device_name AS \"deviceName\",device_status AS status",
        [deviceId,status]
      );
      if (result.rowCount !== 1) throw makeError("The attendance device was not found.", "P0002");
      return result.rows[0];
    },

    async createMapping(input) {
      assertUuid(input.deviceId, "Device ID");
      assertUuid(input.staffId, "Staff ID");
      const result = await pool.query(
        "INSERT INTO cornhill_school.attendance_device_staff_mappings " +
        "(device_id,device_staff_identifier,staff_account_id,effective_from,is_active,created_by_staff_id) " +
        "VALUES ($1::uuid,$2,$3::uuid,$4::date,true,$5::uuid) " +
        "RETURNING id::text AS id,device_id::text AS \"deviceId\",device_staff_identifier AS \"deviceStaffIdentifier\", " +
        "staff_account_id::text AS \"staffId\",effective_from::text AS \"effectiveFrom\",is_active AS active",
        [input.deviceId,input.deviceStaffIdentifier,input.staffId,input.effectiveFrom,input.createdByStaffId]
      );
      return result.rows[0];
    },

    async closeMapping({ mappingId, effectiveTo }) {
      assertUuid(mappingId, "Mapping ID");
      const result = await pool.query(
        "UPDATE cornhill_school.attendance_device_staff_mappings " +
        "SET effective_to=$2::date,is_active=false WHERE id=$1::uuid AND is_active=true " +
        "RETURNING id::text AS id,device_staff_identifier AS \"deviceStaffIdentifier\",effective_to::text AS \"effectiveTo\",is_active AS active",
        [mappingId,effectiveTo]
      );
      if (result.rowCount !== 1) throw makeError("The active attendance device mapping was not found.", "P0002");
      return result.rows[0];
    },

    async listImports({ limit = 50 } = {}) {
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit,1),100) : 50;
      const result = await pool.query(
        "SELECT b.id::text AS id,b.device_id::text AS \"deviceId\",d.device_code AS \"deviceCode\", " +
        "d.device_name AS \"deviceName\",b.source_name AS \"sourceName\", " +
        "b.rows_received AS \"rowsReceived\",b.rows_accepted AS \"rowsAccepted\", " +
        "b.rows_rejected AS \"rowsRejected\",b.import_status AS status, " +
        "b.started_at AS \"startedAt\",b.completed_at AS \"completedAt\",b.error_summary AS \"errorSummary\" " +
        "FROM cornhill_school.attendance_import_batches b " +
        "JOIN cornhill_school.attendance_devices d ON d.id=b.device_id " +
        "ORDER BY b.started_at DESC LIMIT $1",
        [safeLimit]
      );
      return result.rows;
    },

    async listRejections({ batchId, limit = 200 } = {}) {
      assertUuid(batchId, "Import batch ID");
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit,1),500) : 200;
      const result = await pool.query(
        "SELECT source_row_number AS \"rowNumber\",reason_code AS \"reasonCode\",reason, " +
        "source_row_sha256 AS \"sourceRowSha256\",created_at AS \"createdAt\" " +
        "FROM cornhill_school.attendance_import_rejections " +
        "WHERE import_batch_id=$1::uuid ORDER BY source_row_number LIMIT $2",
        [batchId,safeLimit]
      );
      return result.rows;
    },

    async importCsv({ deviceId, sourceName, csvText, columns, importedByStaffId }) {
      assertUuid(deviceId, "Device ID");
      assertUuid(importedByStaffId, "Importing staff ID");
      const parsedRows = parseAttendanceCsv(csvText, columns);
      const sourceChecksum = checksum(csvText);
      const client = await pool.connect();
      let transactionOpen = false;
      const rejectionSummary = [];
      let accepted = 0;
      let rejected = 0;
      let batchId = null;

      try {
        await client.query("BEGIN");
        transactionOpen = true;
        const device = await client.query(
          "SELECT id::text AS id,device_status AS status FROM cornhill_school.attendance_devices WHERE id=$1::uuid FOR UPDATE",
          [deviceId]
        );
        if (device.rowCount !== 1) throw makeError("The attendance device was not found.", "P0002");
        if (device.rows[0].status !== "Active") throw makeError("Activate the attendance device before importing events.", "DEVICE_NOT_ACTIVE");

        const created = await client.query(
          "INSERT INTO cornhill_school.attendance_import_batches " +
          "(device_id,source_name,source_checksum_sha256,imported_by_staff_id) " +
          "VALUES ($1::uuid,$2,$3,$4::uuid) " +
          "RETURNING id::text AS id,started_at",
          [deviceId,sourceName,sourceChecksum,importedByStaffId]
        );
        batchId = created.rows[0].id;
        await client.query(
          "UPDATE cornhill_school.attendance_import_batches SET import_status='Processing' WHERE id=$1::uuid",
          [batchId]
        );

        async function recordRejection(row,rejection) {
          await client.query(
            "INSERT INTO cornhill_school.attendance_import_rejections " +
            "(import_batch_id,source_row_number,reason_code,reason,source_row_sha256) " +
            "VALUES ($1::uuid,$2,$3,$4,$5)",
            [batchId,row.rowNumber,rejection.code,rejection.reason,row.sourceRowSha256]
          );
          rejected += 1;
          if (rejectionSummary.length < 50) {
            rejectionSummary.push({rowNumber:row.rowNumber,reasonCode:rejection.code,reason:rejection.reason});
          }
        }

        for (const row of parsedRows) {
          if (row.error) {
            await recordRejection(row,{code:row.error.reasonCode,reason:row.error.reason});
            continue;
          }
          const externalEventId = row.externalEventId || autoEventId({
            deviceId,staffIdentifier:row.staffIdentifier,occurredAt:row.occurredAt,eventType:row.eventType
          });
          await client.query("SAVEPOINT attendance_import_row");
          try {
            await client.query(
              "INSERT INTO cornhill_school.attendance_events " +
              "(import_batch_id,device_id,device_staff_identifier,external_event_id,event_type,occurred_at,source_type) " +
              "VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::timestamptz,'Device')",
              [batchId,deviceId,row.staffIdentifier,externalEventId,row.eventType,row.occurredAt]
            );
            await client.query("RELEASE SAVEPOINT attendance_import_row");
            accepted += 1;
          } catch (error) {
            await client.query("ROLLBACK TO SAVEPOINT attendance_import_row");
            await client.query("RELEASE SAVEPOINT attendance_import_row");
            await recordRejection(row,rejectionFor(error));
          }
        }

        const finalized = await client.query(
          "UPDATE cornhill_school.attendance_import_batches " +
          "SET rows_received=$2,rows_accepted=$3,rows_rejected=$4,import_status='Completed' " +
          "WHERE id=$1::uuid RETURNING id::text AS id,device_id::text AS \"deviceId\", " +
          "source_name AS \"sourceName\",rows_received AS \"rowsReceived\", " +
          "rows_accepted AS \"rowsAccepted\",rows_rejected AS \"rowsRejected\", " +
          "import_status AS status,started_at AS \"startedAt\",completed_at AS \"completedAt\"",
          [batchId,parsedRows.length,accepted,rejected]
        );
        await client.query(
          "UPDATE cornhill_school.attendance_devices SET last_import_at=now() WHERE id=$1::uuid",
          [deviceId]
        );
        await client.query("COMMIT");
        transactionOpen = false;
        return { batch:finalized.rows[0], rejections:rejectionSummary, sourceChecksum };
      } catch (error) {
        if (transactionOpen) {
          try { await client.query("ROLLBACK"); } catch {}
        }
        if (error?.code === "23505") {
          throw makeError("This CSV file or one of its terminal event identifiers has already been imported.", "ATTENDANCE_IMPORT_DUPLICATE");
        }
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
