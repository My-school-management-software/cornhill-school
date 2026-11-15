import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const sql=await readFile(new URL("../migrations/080_local_director_staff_administration.sql",import.meta.url),"utf8");
test("Director administration functions use SECURITY DEFINER with a fixed search path",()=>{
 for(const name of ["assert_director_role_manager","set_staff_role_permissions","create_staff_account"]){
  const i=sql.indexOf("FUNCTION cornhill_auth."+name);
  assert.ok(i>=0,name+" function missing");
  const fragment=sql.slice(i,sql.indexOf("$function$;",i)+12);
  assert.match(fragment,/SECURITY DEFINER/);
  assert.match(fragment,/SET search_path = pg_catalog, cornhill_auth/);
 }
});
test("only Director can change non-Director role grants; protected capabilities cannot be delegated",()=>{
 assert.match(sql,/a\.account_status = 'active'/);
 assert.match(sql,/ra\.role_code = 'director'/);
 assert.match(sql,/rp\.permission_code = 'system\.roles_manage'/);
 assert.match(sql,/p_role_code = 'director'/);
 assert.match(sql,/system\.backups_manage/);
 assert.match(sql,/security\.role_permissions_changed/);
 assert.match(sql,/granted_by_staff_id/);
});
test("staff account creation is atomic, Argon2id-only and audited",()=>{
 assert.match(sql,/p_password_hash NOT LIKE '\$argon2id\$%'/);
 assert.match(sql,/INSERT INTO cornhill_auth\.staff_accounts/);
 assert.match(sql,/INSERT INTO cornhill_school\.staff_profiles/);
 assert.match(sql,/INSERT INTO cornhill_auth\.staff_role_assignments/);
 assert.match(sql,/security\.staff_account_created/);
 assert.match(sql,/REVOKE ALL ON FUNCTION cornhill_auth\.create_staff_account/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION cornhill_auth\.create_staff_account[\s\S]*TO cornhill_auth_runtime/);
 assert.doesNotMatch(sql,/GRANT .* TO PUBLIC/i);
});
