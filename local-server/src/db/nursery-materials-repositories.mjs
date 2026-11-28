// V49: append-only, learner-scoped Nursery material receipt repository.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(label + " is invalid.");
}
function conflict() {
  const error = new Error("Collection conflicts with existing receipt or learner status.");
  error.code = "COLLECTION_CONFLICT";
  return error;
}
export function createPostgresNurseryMaterialsRepository(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("Nursery materials require a PostgreSQL query pool.");
  }
  return Object.freeze({
    async getLearnerScope(learnerId) {
      requireUuid(learnerId, "Learner ID");
      const result = await pool.query(
        "SELECT l.id::text AS id, l.class_id::text AS \"classId\", " +
        "l.status, c.section AS \"classSection\" " +
        "FROM cornhill_school.learners l " +
        "JOIN cornhill_school.classes c ON c.id=l.class_id " +
        "WHERE l.id=$1::uuid LIMIT 1", [learnerId]
      );
      const row = result.rows[0] ?? null;
      return row && row.classSection === "Nursery" ? row : null;
    },
    async listCollections(learnerId) {
      requireUuid(learnerId, "Learner ID");
      const result = await pool.query(
        "SELECT id::text AS id, request_id::text AS \"requestId\", " +
        "learner_id::text AS \"learnerId\", material_name AS \"materialName\", " +
        "quantity_received AS \"quantityReceived\", received_date::text AS \"receivedDate\", " +
        "notes, recorded_by_staff_id::text AS \"recordedByStaffId\", " +
        "created_at AS \"createdAt\" " +
        "FROM cornhill_school.nursery_material_receipts WHERE learner_id=$1::uuid " +
        "ORDER BY received_date DESC, created_at DESC, id DESC LIMIT 1000", [learnerId]
      );
      return result.rows;
    },
    // Always calculate totals over ALL receipts. Only the visible history is limited
    // to 1,000 rows so the UI cannot silently undercount long-term collections.
    async summarizeAllCollections(learnerId) {
      requireUuid(learnerId, "Learner ID");
      const result = await pool.query(
        "SELECT MIN(material_name) AS \"materialName\", " +
        "COUNT(*)::text AS \"collectionEvents\", " +
        "SUM(quantity_received)::text AS \"quantityReceived\" " +
        "FROM cornhill_school.nursery_material_receipts " +
        "WHERE learner_id=$1::uuid GROUP BY lower(material_name) " +
        "ORDER BY MIN(material_name)", [learnerId]
      );
      let total = 0;
      const materials = result.rows.map(row => {
        const collectionEvents = Number(row.collectionEvents);
        const quantityReceived = Number(row.quantityReceived);
        if (!Number.isSafeInteger(collectionEvents) || !Number.isSafeInteger(quantityReceived) ||
            collectionEvents < 1 || quantityReceived < 1) {
          throw new RangeError("Learner material totals exceed the safe counting range.");
        }
        total += collectionEvents;
        if (!Number.isSafeInteger(total)) throw new RangeError("Learner receipt count is too large.");
        return {materialName:row.materialName, quantityReceived, collectionEvents};
      });
      return {learnerId, collectionEvents:total, materials};
    },
    async recordCollection({actorStaffId,collection}) {
      requireUuid(actorStaffId, "Staff account");
      if (!collection || typeof collection !== "object") throw new TypeError("Collection input is required.");
      requireUuid(collection.learnerId, "Learner ID");
      requireUuid(collection.requestId, "Request ID");
      const params = [
        collection.learnerId, collection.requestId, collection.materialName,
        collection.quantityReceived, collection.receivedDate, collection.notes,
        actorStaffId
      ];
      const result = await pool.query(
        "INSERT INTO cornhill_school.nursery_material_receipts " +
        "(learner_id,request_id,material_name,quantity_received,received_date,notes,recorded_by_staff_id) " +
        "SELECT l.id,$2::uuid,$3::text,$4::integer,$5::date,$6::text,$7::uuid " +
        "FROM cornhill_school.learners l " +
        "JOIN cornhill_school.classes c ON c.id=l.class_id " +
        "WHERE l.id=$1::uuid AND l.status='Active' AND c.section='Nursery' " +
        "ON CONFLICT (request_id) DO NOTHING " +
        "RETURNING id::text AS id, learner_id::text AS \"learnerId\", " +
        "request_id::text AS \"requestId\", material_name AS \"materialName\", " +
        "quantity_received AS \"quantityReceived\", received_date::text AS \"receivedDate\", " +
        "notes, recorded_by_staff_id::text AS \"recordedByStaffId\", " +
        "created_at AS \"createdAt\"", params
      );
      if (result.rows.length > 0) return {created: true, receipt: result.rows[0]};
      // Check the idempotency key *only* to prevent double recording, not to disclose other learners.
      const duplicate = await pool.query(
        "SELECT id::text AS id, learner_id::text AS \"learnerId\", " +
        "request_id::text AS \"requestId\", material_name AS \"materialName\", " +
        "quantity_received AS \"quantityReceived\", received_date::text AS \"receivedDate\", " +
        "notes, recorded_by_staff_id::text AS \"recordedByStaffId\", " +
        "created_at AS \"createdAt\" " +
        "FROM cornhill_school.nursery_material_receipts WHERE request_id=$1::uuid", [collection.requestId]
      );
      const row = duplicate.rows[0];
      if (!row || row.learnerId.toLowerCase() !== collection.learnerId.toLowerCase() ||
          row.recordedByStaffId.toLowerCase() !== actorStaffId.toLowerCase() ||
          row.materialName !== collection.materialName ||
          row.quantityReceived !== collection.quantityReceived ||
          row.receivedDate !== collection.receivedDate ||
          (row.notes ?? null) !== (collection.notes ?? null)) throw conflict();
      return {created: false, receipt: row};
    }
  });
}
