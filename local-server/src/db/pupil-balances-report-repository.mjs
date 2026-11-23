/**
 * V124C PROTOTYPE ONLY.
 * Requires independent review/PG17 acceptance of
 * staging/v124c_pupil_balances_PROTOTYPE_NOT_FOR_INSTALL.sql before use.
 * Does not acquire any write permission, record payments, or persist reports.
 */
export function createPupilBalancesReportRepository(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("Restricted PostgreSQL finance pool is required.");
  }
  return Object.freeze({
    async getPupilBalances({actorStaffId,filters}) {
      if (typeof actorStaffId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorStaffId)) {
        throw new TypeError("A verified finance actor ID is required.");
      }
      if (!filters || !Number.isSafeInteger(filters.page) ||
          !Number.isSafeInteger(filters.pageSize) ||
          filters.page<1 || filters.pageSize<1 || filters.pageSize>100) {
        throw new TypeError("Validated reporting filters are required.");
      }
      // PostgreSQL parameter binding prevents SQL injection. The SQL function
      // independently checks actor role/permission and all filter limits.
      const result=await pool.query(
        "SELECT cornhill_school.v124c_preview_pupil_balances("+
        "$1::uuid,$2::integer,$3::integer,$4::text,$5::text,$6::text,$7::integer,$8::integer"+
        ") AS report",
        [
          actorStaffId,
          filters.year ?? null,
          filters.term ?? null,
          filters.className ?? "",
          filters.status ?? "all",
          filters.query ?? "",
          filters.page, filters.pageSize
        ]
      );
      const report=result.rows[0]?.report;
      if (!report || !Array.isArray(report.rows) || !report.totals) {
        throw new Error("Incomplete finance report returned from database.");
      }
      return report;
    }
  });
}
