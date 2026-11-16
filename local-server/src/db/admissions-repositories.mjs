const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredText(value, label, max = 80) {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) {
    throw new TypeError(label + " is required and must be " + max + " characters or fewer.");
  }
  return value.trim();
}

export function createPostgresAdmissionsRepository(pool) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A PostgreSQL pool is required.");
  return Object.freeze({
    async updateLearnerProfile({learnerId,actorStaffId,changes,reason,canManageLin, classIds=[], requireAssignedClass=false}) {
      const allowed = new Map([
        ["firstName", ["first_name", value => value]],
        ["middleName", ["middle_name", value => value]],
        ["lastName", ["last_name", value => value]],
        ["gender", ["gender", value => value]],
        ["dateOfBirth", ["date_of_birth", value => value]],
        ["lin", ["lin", value => value]],
        ["learnerType", ["learner_type", value => value]],
        ["previousSchool", ["previous_school", value => value]],
        ["p7IndexNumber", ["p7_index_number", value => value]]
      ]);
      if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
          Object.keys(changes).length === 0 || Object.keys(changes).some(key => !allowed.has(key)) ||
          !UUID_PATTERN.test(learnerId ?? "") || !UUID_PATTERN.test(actorStaffId ?? "") ||
          typeof reason !== "string" || !reason.trim() || reason.length > 300 ||
          (Object.hasOwn(changes, "lin") && canManageLin !== true)) {
        throw new TypeError("Learner profile update input is invalid.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query(
          "SELECT id,class_id,lin FROM cornhill_school.learners WHERE id=$1::uuid FOR UPDATE",
          [learnerId]
        );
        const current = locked.rows[0];
        if (!current) { await client.query("ROLLBACK"); return null; }
        if (requireAssignedClass && (!current.class_id || !Array.isArray(classIds) ||
            !classIds.some(id => typeof id === "string" && id.toLowerCase() === String(current.class_id).toLowerCase()))) {
          const error = new Error("Learner is outside the assigned class scope.");
          error.code = "42501";
          throw error;
        }
        const entries = Object.entries(changes).filter(([key,value]) => key !== "lin" || value !== current.lin);
        if (entries.length === 0) { await client.query("ROLLBACK"); return {id:current.id,updatedFields:[]}; }
        const assignments = entries.map(([key],index) => allowed.get(key)[0] + "=$" + (index+2) +
          (key === "dateOfBirth" ? "::date" : ""));
        assignments.push("updated_at=now()");
        const values = entries.map(([key,value]) => allowed.get(key)[1](value));
        const updated = await client.query(
          "UPDATE cornhill_school.learners SET " + assignments.join(",") +
          " WHERE id=$1::uuid RETURNING id,pupil_code,lin,first_name,middle_name,last_name,gender,date_of_birth",
          [learnerId,...values]
        );
        const updatedFields = entries.map(([key]) => key);
        await client.query(
          "INSERT INTO cornhill_school.admission_events (learner_id,event_code,actor_staff_id,reason,details) " +
          "VALUES ($1::uuid,'profile_updated',$2::uuid,$3,$4::jsonb)",
          [learnerId,actorStaffId,reason.trim(),JSON.stringify({updatedFields})]
        );
        await client.query("COMMIT");
        return {...updated.rows[0],updatedFields};
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally { client.release(); }
    }
    async registerLearner(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const learnerResult = await client.query(
          "INSERT INTO cornhill_school.learners " +
          "(first_name,middle_name,last_name,gender,date_of_birth,lin,class_id,admission_date,learner_type," +
          "previous_school,p7_index_number,is_bursary,bursary_fee_ugx,bursary_category,bursary_reason," +
          "takes_breakfast,takes_lunch,admission_complete) " +
          "VALUES ($1,$2,$3,$4,$5::date,$6,$7::uuid,$8::date,$9,$10,$11,$12,$13,$14,$15,$16,$17,true) " +
          "RETURNING id,pupil_code,lin,first_name,middle_name,last_name,gender,date_of_birth,class_id,admission_date,status,is_bursary,bursary_fee_ugx",
          [input.firstName,input.middleName,input.lastName,input.gender,input.dateOfBirth,input.lin,input.classId,
           input.admissionDate,input.learnerType,input.previousSchool,input.p7IndexNumber,input.isBursary,
           input.bursaryFeeUgx,input.bursaryCategory,input.bursaryReason,input.takesBreakfast,input.takesLunch]
        );
        const learner = learnerResult.rows[0];
        if (input.guardian) {
          const g = input.guardian;
          await client.query(
            "INSERT INTO cornhill_school.guardian_contacts " +
            "(learner_id,guardian_name,relationship,phone_e164,whatsapp_e164,email,is_primary,sms_opt_in,whatsapp_opt_in) " +
            "VALUES ($1::uuid,$2,$3,$4,$5,$6,true,$7,$8)",
            [learner.id,g.name,g.relationship,g.phone,g.whatsapp,g.email,g.smsOptIn,g.whatsappOptIn]
          );
        }
        await client.query(
          "INSERT INTO cornhill_school.enrolment_periods (learner_id,admission_date,class_id,created_by_staff_id) " +
          "VALUES ($1::uuid,$2::date,$3::uuid,$4::uuid)",
          [learner.id,input.admissionDate,input.classId,input.actorStaffId]
        );
        await client.query(
          "INSERT INTO cornhill_school.admission_events (learner_id,event_code,actor_staff_id,reason,details) " +
          "VALUES ($1::uuid,'admitted',$2::uuid,$3,$4::jsonb)",
          [learner.id,input.actorStaffId,input.reason,JSON.stringify({classId:input.classId,guardianAdded:Boolean(input.guardian),bursary:input.isBursary})]
        );
        await client.query("COMMIT");
        return learner;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
