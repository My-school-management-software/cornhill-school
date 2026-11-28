(() => {
"use strict";
const $ = id => document.getElementById(id);
let principal = null;
let workspace = { classes: [], years: [], terms: [], assessments: [] };
let selected = null;
let advancementReview = null;
let advancementEditors = [];
const csrf = () => {
  const prefix = "__Host-cornhill_csrf=";
  const item = document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
};
async function api(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers["X-Cornhill-CSRF"] = csrf();
  const response = await fetch("/api/v1" + path, {
    method, headers, credentials: "same-origin", cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || "Academic request failed (" + response.status + ").");
  return data;
}
function can(code) {
  return (principal?.roles || []).some(role => (principal.rolePermissions?.[role] || []).includes(code));
}
function notice(message, bad = false) {
  $("notice").textContent = message;
  $("notice").className = "notice" + (bad ? " error" : "");
}
function scopedClasses() {
  const teacherRoles = ["teacher", "class_teacher", "upper_primary_teacher", "lower_primary_teacher", "nursery_head"];
  return (principal.roles || []).some(role => teacherRoles.includes(role));
}
function setOptions(select, firstLabel, entries, labelFn) {
  select.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = firstLabel;
  select.append(first);
  for (const item of entries) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = labelFn(item);
    select.append(option);
  }
}
function renderAssessments() {
  const classId = $("class-select").value;
  const termId = $("term-select").value;
  const list = workspace.assessments.filter(item =>
    (!classId || item.classId === classId) && (!termId || item.academicTermId === termId)
  );
  setOptions($("assessment-select"), "Choose assessment", list,
    item => item.assessmentName + " · " + item.status + " · " + item.className);
}
function renderAdvancementOptions() {
  const oldClass = $("advancement-class-select").value;
  const oldTerm = $("advancement-term-select").value;
  setOptions($("advancement-class-select"), "Choose class", workspace.classes,
    item => item.displayName + (item.stream ? " · " + item.stream : ""));
  const firstTerms = workspace.terms.filter(item => Number(item.termNumber) === 1);
  setOptions($("advancement-term-select"), "Choose new-year Term 1", firstTerms,
    item => item.academicYear + " · " + item.termName + " (" + item.status + ")");
  if (workspace.classes.some(item => item.id === oldClass)) {
    $("advancement-class-select").value = oldClass;
  } else if ($("class-select").value) $("advancement-class-select").value = $("class-select").value;
  if (firstTerms.some(item => item.id === oldTerm)) {
    $("advancement-term-select").value = oldTerm;
  } else {
    const active = firstTerms.find(item => item.status === "Active");
    if (active) $("advancement-term-select").value = active.id;
  }
  $("advancement-panel").hidden = !can("learners.manage");
}
async function loadWorkspace() {
  const query = new URLSearchParams();
  if ($("class-select").value) query.set("classId", $("class-select").value);
  const data = await api("/academics/workspace" + (query.size ? "?" + query.toString() : ""));
  workspace = data;
  setOptions($("class-select"), "Choose permitted class", workspace.classes,
    item => item.displayName + (item.stream ? " · " + item.stream : ""));
  if (selected?.classId && workspace.classes.some(item => item.id === selected.classId)) $("class-select").value = selected.classId;
  setOptions($("period-year-select"), "Choose academic year", workspace.years,
    item => item.yearLabel + " · " + item.status);
  renderPeriods();
  renderAdvancementOptions();
  setOptions($("term-select"), "Choose academic term", workspace.terms,
    item => item.academicYear + " · " + item.termName + " (" + item.status + ")");
  const active = workspace.terms.find(item => item.status === "Active");
  if (active) $("term-select").value = active.id;
  renderAssessments();
  $("period-setup").hidden = !can("academics.terms_manage");
  $("create-panel").hidden = !can("academics.assessments_manage");
  const hasAccess = can("academics.results_view") || can("academics.marks_enter") || can("academics.assessments_manage");
  $("access-label").textContent = hasAccess ? "Authorised academic access" : "Read-only / no access";
  $("access-label").hidden = !hasAccess;
  notice("Academic workspace loaded. " + workspace.classes.length + " permitted class(es), " +
    workspace.years.length + " year(s), " + workspace.terms.length + " term(s).");
}
function renderPeriods() {
  const yearHost = $("years-list");
  const termHost = $("terms-list");
  yearHost.replaceChildren();
  termHost.replaceChildren();
  if (!workspace.years.length) yearHost.textContent = "No academic years created.";
  else for (const year of workspace.years) {
    const item = document.createElement("div");
    item.className = "period-item";
    item.textContent = year.yearLabel + " · " + year.startsOn + " to " + year.endsOn + " · " + year.status;
    yearHost.append(item);
  }
  if (!workspace.terms.length) termHost.textContent = "No terms created.";
  else for (const term of workspace.terms) {
    const item = document.createElement("div");
    item.className = "period-item";
    item.textContent = term.academicYear + " · " + term.termName + " · " + term.startsOn + " to " + term.endsOn + " · " + term.status;
    termHost.append(item);
  }
  const yearSelect = $("period-year-select");
  if (yearSelect && !yearSelect.value) {
    const activeYear = workspace.years.find(year => year.status === "Active");
    if (activeYear) yearSelect.value = activeYear.id;
  }
}
function appendCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value ?? "—";
  row.append(cell);
  return cell;
}
function renderMarks(data) {
  selected = data.assessment;
  $("assessment-status").textContent = data.assessment.assessmentName + " · " + data.assessment.status;
  $("empty").hidden = true;
  $("marks-area").hidden = false;
  $("mark-rows").replaceChildren();
  const editable = can("academics.marks_enter") && data.assessment.status === "Open";
  let existing = 0;
  for (const learner of data.learners) {
    for (const mark of learner.marks) {
      const row = document.createElement("tr");
      appendCell(row, learner.pupilCode);
      appendCell(row, learner.lin || "—");
      appendCell(row, [learner.firstName, learner.middleName, learner.lastName].filter(Boolean).join(" "));
      appendCell(row, mark.subjectName);
      const scoreCell = document.createElement("td");
      const score = document.createElement("input");
      score.type = "number";
      score.min = "0";
      score.max = String(data.assessment.maxScore);
      score.step = "0.01";
      score.inputMode = "decimal";
      score.value = mark.score == null ? "" : String(mark.score);
      score.disabled = !editable;
      score.dataset.learnerId = learner.id;
      score.dataset.subjectId = mark.subjectId;
      scoreCell.append(score);
      row.append(scoreCell);
      const commentCell = document.createElement("td");
      const comment = document.createElement("input");
      comment.type = "text";
      comment.maxLength = 600;
      comment.className = "comment";
      comment.value = mark.comment || "";
      comment.disabled = !editable;
      comment.dataset.commentFor = learner.id + ":" + mark.subjectId;
      commentCell.append(comment);
      row.append(commentCell);
      $("mark-rows").append(row);
      if (mark.score != null) existing += 1;
    }
  }
  $("save-marks").hidden = !editable;
  const learnerSelect = $("report-history-learner");
  setOptions(learnerSelect, "Choose a learner", data.learners,
    item => item.pupilCode + " · " + [item.firstName, item.middleName, item.lastName].filter(Boolean).join(" "));
  $("report-history-panel").hidden = !can("academics.results_view");
  $("report-history").textContent = "Choose a learner to view saved report cards.";
  $("mark-summary").textContent = data.learners.length + " learners · " + data.subjects.length +
    " subjects · " + existing + " saved mark(s) · maximum " + data.assessment.maxScore;
  renderWorkflowActions(data.assessment);
}
function renderWorkflowActions(assessment) {
  const host = $("workflow-actions");
  host.replaceChildren();
  const add = (label, status, permission) => {
    if (!can(permission)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", async () => {
      try {
        await api("/academics/assessments/" + assessment.id + "/status", {
          method: "PATCH", body: { status }
        });
        notice("Assessment moved to " + status + ".");
        await refreshWorkspaceAndAssessment(assessment.id);
      } catch (error) { notice(error.message, true); }
    });
    host.append(button);
  };
  if (assessment.status === "Draft") add("Open assessment", "Open", "academics.assessments_manage");
  if (assessment.status === "Open") add("Lock marks", "Locked", "academics.assessments_manage");
  if (assessment.status === "Locked") add("Publish results", "Published", "academics.results_publish");
  if (assessment.status === "Published" && can("academics.results_publish")) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Generate report cards";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await api("/academics/assessments/" + assessment.id + "/report-cards", { method: "POST", body: {} });
        notice(result.generatedCount + " historical report card(s) are saved for this assessment.");
      } catch (error) { notice(error.message, true); }
      finally { button.disabled = false; }
    });
    host.append(button);
  }
}
function renderReportCards(cards) {
  const host = $("report-history");
  host.replaceChildren();
  if (!cards.length) {
    host.textContent = "No saved report cards are available for this learner and your class access.";
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Academic period", "Class and assessment", "Total", "Average", "Aggregate / division", "Position", "Subject results"]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  table.append(head);
  const body = document.createElement("tbody");
  for (const card of cards) {
    const row = document.createElement("tr");
    appendCell(row, card.academicYear + " · " + card.termName);
    appendCell(row, card.className + " · " + card.assessmentName + " · " + card.assessmentDate);
    appendCell(row, Number(card.totalScore).toFixed(2) + " / " + Number(card.totalPossible).toFixed(2));
    appendCell(row, Number(card.averagePercent).toFixed(2) + "%");
    appendCell(row, card.aggregate == null ? "—" : String(card.aggregate) + (card.division ? " · " + card.division : ""));
    appendCell(row, card.position + " of " + card.classSize);
    const subjectCell = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Show subjects";
    details.append(summary);
    const list = document.createElement("ul");
    for (const subject of card.subjects || []) {
      const item = document.createElement("li");
      item.textContent = subject.subjectName + ": " + subject.score + " / " + subject.maxScore +
        " (" + subject.percent + "%, " + subject.grade + ")" + (subject.comment ? " · " + subject.comment : "");
      list.append(item);
    }
    details.append(list);
    subjectCell.append(details);
    row.append(subjectCell);
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  host.append(wrap);
}
async function loadReportHistory() {
  const learnerId = $("report-history-learner").value;
  if (!learnerId || !can("academics.results_view")) return;
  try {
    const cards = await api("/academics/learners/" + learnerId + "/report-cards");
    renderReportCards(cards);
    notice(cards.length + " historical report card(s) loaded.");
  } catch (error) { notice(error.message, true); }
}
async function loadSelectedAssessment() {
  const id = $("assessment-select").value;
  if (!id) {
    selected = null;
    $("marks-area").hidden = true;
    $("empty").hidden = false;
    $("empty").textContent = "Choose an assessment to load the class mark register.";
    $("assessment-status").textContent = "No assessment selected";
    $("workflow-actions").replaceChildren();
    $("report-history-panel").hidden = true;
    return;
  }
  try {
    const data = await api("/academics/assessments/" + id + "/marks");
    renderMarks(data);
    notice("Loaded " + data.learners.length + " learners for " + data.assessment.assessmentName + ".");
  } catch (error) {
    $("marks-area").hidden = true;
    $("empty").hidden = false;
    $("empty").textContent = error.message;
    notice(error.message, true);
  }
}
async function refreshWorkspaceAndAssessment(id) {
  await loadWorkspace();
  const exists = workspace.assessments.some(item => item.id === id);
  if (exists) {
    $("assessment-select").value = id;
    await loadSelectedAssessment();
  }
}
async function saveMarks() {
  if (!selected || selected.status !== "Open" || !can("academics.marks_enter")) return;
  const marks = [];
  for (const input of $("mark-rows").querySelectorAll("input[data-learner-id]")) {
    if (input.value.trim() === "") continue;
    const score = Number(input.value);
    if (!Number.isFinite(score) || score < 0 || score > selected.maxScore) {
      throw new Error("A score must be between zero and " + selected.maxScore + ".");
    }
    const comment = $("mark-rows").querySelector('[data-comment-for="' + input.dataset.learnerId + ":" + input.dataset.subjectId + '"]')?.value || null;
    marks.push({
      learnerId: input.dataset.learnerId, subjectId: input.dataset.subjectId,
      score, comment: comment?.trim() || null
    });
  }
  if (!marks.length) throw new Error("Enter at least one score before saving.");
  if (marks.length > 500) throw new Error("Save no more than 500 marks at a time.");
  const result = await api("/academics/marks", {
    method: "POST",
    body: { assessmentId: selected.id, classId: selected.classId, marks }
  });
  notice(result.savedCount + " mark(s) saved. Audit history was recorded.");
  await loadSelectedAssessment();
}
function updateAdvancementBatchStatus() {
  const count = advancementEditors.filter(editor => editor.decision.value).length;
  $("advancement-selected-count").textContent =
    count + " learner(s) selected. Everyone else remains pending.";
  $("approve-selected-advancements").disabled =
    count < 1 || count > 100 || !advancementReview?.canApprove;
}
$("approve-selected-advancements").addEventListener("click", async () => {
  if (!advancementReview?.canApprove) return;
  const selectedEditors = advancementEditors.filter(editor => editor.decision.value);
  if (!selectedEditors.length || selectedEditors.length > 100) {
    notice("Select between 1 and 100 individual decisions.", true);
    return;
  }
  const decisions = [];
  for (const editor of selectedEditors) {
    const reason = editor.reason.value.trim();
    if (reason.length < 2 || reason.length > 300) {
      notice("Enter a reason for every selected learner. Check " + editor.learner.learnerName, true);
      return;
    }
    decisions.push({
      learnerId: editor.learner.id,
      decision: editor.decision.value,
      reason
    });
  }
  const textSummary = decisions.reduce((counts, item) => {
    counts[item.decision] = (counts[item.decision] || 0) + 1;
    return counts;
  }, {});
  if (!window.confirm("Approve " + decisions.length +
      " individually selected learners in " + advancementReview.className +
      " for " + advancementReview.yearLabel + "? Promote: " +
      (textSummary.Promote || 0) + ", Repeat: " + (textSummary.Repeat || 0) +
      ", Complete P.7: " + (textSummary.Complete || 0) +
      ". Unselected learners remain pending. All selected decisions succeed together or none are saved.")) {
    return;
  }
  const button = $("approve-selected-advancements");
  button.disabled = true;
  try {
    const response = await api("/academics/advancement/batch", {
      method: "POST", body: {
        fromClassId: advancementReview.classId,
        academicTermId: advancementReview.termId,
        decisions, approved: true
      }
    });
    notice(response.result.approvedCount + " manually selected decisions approved and recorded.");
    await loadAdvancementCandidates();
  } catch (error) {
    notice(error.message, true);
    updateAdvancementBatchStatus();
  }
});
async function loadAdvancementCandidates() {
  const classId = $("advancement-class-select").value;
  const academicTermId = $("advancement-term-select").value;
  if (!classId || !academicTermId) {
    $("advancement-summary").textContent = "Select a class and the new academic year's Term 1.";
    return;
  }
  $("advancement-summary").textContent = "Loading the learner-by-learner review list…";
  $("advancement-candidates").replaceChildren();
  advancementReview = null;
  advancementEditors = [];
  updateAdvancementBatchStatus();
  try {
    const query = new URLSearchParams({ classId, academicTermId });
    const { review } = await api("/academics/advancement/candidates?" + query);
    advancementReview = review;
    $("advancement-summary").textContent = review.className + " — " + review.yearLabel +
      ": " + review.candidates.length + " learner(s) awaiting a decision. " +
      review.newYearClassCount + " already assigned in this new academic year. " +
      (review.canApprove ? "Individual decisions enabled." :
        "Review only: activate the new academic year and Term 1 before approving.");
    const host = $("advancement-candidates");
    if (!review.candidates.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No pending learners for this class and academic year.";
      host.append(empty);
    }
    for (const learner of review.candidates) {
      const row = document.createElement("section");
      row.className = "advancement-row";
      const name = document.createElement("strong");
      name.textContent = learner.learnerName;
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent = (learner.pupilCode || "") +
        (learner.lin ? " · LIN " + learner.lin : "") +
        " · Previous enrolment " + learner.enrolledFrom;
      const identity = document.createElement("div");
      identity.append(name, meta);
      const controls = document.createElement("div");
      controls.className = "advancement-controls";
      const decision = document.createElement("select");
      decision.setAttribute("aria-label", "Decision for " + learner.learnerName);
      const choices = [{ value: "", label: "Not yet decided — keep pending" }];
      if (review.nextClassId) choices.push({
        value: "Promote", label: "Promote to " + review.nextClassName
      });
      choices.push({ value: "Repeat", label: "Repeat " + review.className });
      if (review.classCode === "P7") choices.push({
        value: "Complete", label: "Completed primary school (graduate)"
      });
      for (const choice of choices) {
        const option = document.createElement("option");
        option.value = choice.value;
        option.textContent = choice.label;
        decision.append(option);
      }
      const reason = document.createElement("input");
      reason.type = "text";
      reason.minLength = 2;
      reason.maxLength = 300;
      reason.placeholder = "Reason for decision (required)";
      reason.setAttribute("aria-label", "Reason for " + learner.learnerName);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Approve this learner";
      button.disabled = !review.canApprove;
      const result = document.createElement("span");
      result.setAttribute("role", "status");
      controls.append(decision, reason, button, result);
      row.append(identity, controls);
      host.append(row);
      advancementEditors.push({ learner, decision, reason });
      decision.addEventListener("change", updateAdvancementBatchStatus);
      button.addEventListener("click", async () => {
        if (!decision.value) {
          result.textContent = "Choose Promote, Repeat or Complete. Pending makes no changes.";
          return;
        }
        const justification = reason.value.trim();
        if (justification.length < 2 || justification.length > 300) {
          result.textContent = "A reason of 2 to 300 characters is required.";
          return;
        }
        const label = decision.options[decision.selectedIndex].textContent;
        if (!window.confirm("Confirm " + label + " for " + learner.learnerName +
          " (" + learner.pupilCode + ") in " + review.yearLabel +
          "? This is an audited academic change.")) return;
        button.disabled = true;
        result.textContent = "Recording individual decision…";
        try {
          await api("/academics/advancement/decisions", { method: "POST", body: {
            learnerId: learner.id, fromClassId: review.classId,
            academicTermId: review.termId, decision: decision.value,
            reason: justification, approved: true
          }});
          notice(learner.learnerName + ": " + label + " approved and recorded.");
          await loadAdvancementCandidates();
        } catch (error) {
          result.textContent = error.message;
          button.disabled = !review.canApprove;
          notice(error.message, true);
        }
      });
    }
    updateAdvancementBatchStatus();
  } catch (error) {
    $("advancement-summary").textContent = error.message;
    notice(error.message, true);
  }
}
$("load-advancement").addEventListener("click", loadAdvancementCandidates);
for (const id of ["advancement-class-select", "advancement-term-select"]) {
  $(id).addEventListener("change", () => {
    advancementReview = null;
    advancementEditors = [];
    updateAdvancementBatchStatus();
    $("advancement-candidates").replaceChildren();
    $("advancement-summary").textContent = "Selection changed. Load the review list before approving anyone.";
  });
}
$("create-year-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api("/academics/years", {
      method: "POST",
      body: { yearLabel: form.get("yearLabel"), startsOn: form.get("startsOn"),
        endsOn: form.get("endsOn"), status: form.get("status") }
    });
    event.currentTarget.reset();
    await loadWorkspace();
    notice("Academic year created and recorded in the audit history.");
  } catch (error) { notice(error.message, true); }
});
$("create-term-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api("/academics/terms", {
      method: "POST",
      body: { academicYearId: form.get("academicYearId"), termNumber: Number(form.get("termNumber")),
        termName: form.get("termName"), startsOn: form.get("startsOn"),
        endsOn: form.get("endsOn"), status: form.get("status") }
    });
    event.currentTarget.reset();
    await loadWorkspace();
    notice("Academic term created and recorded in the audit history.");
  } catch (error) { notice(error.message, true); }
});
$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const result = await api("/auth/staff/login", {
      method: "POST",
      body: { username: $("username").value, password: $("password").value }
    });
    principal = result.principal;
    await startWorkspace();
  } catch (error) { notice(error.message, true); }
});
$("logout").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST", body: {} }); } catch {}
  principal = null;
  $("app").hidden = true;
  $("login").hidden = false;
  notice("You have signed out.");
});
$("class-select").addEventListener("change", async () => {
  try { await loadWorkspace(); await loadSelectedAssessment(); }
  catch (error) { notice(error.message, true); }
});
$("term-select").addEventListener("change", () => { renderAssessments(); loadSelectedAssessment(); });
$("assessment-select").addEventListener("change", loadSelectedAssessment);
$("reload-marks").addEventListener("click", loadSelectedAssessment);
$("load-report-history").addEventListener("click", loadReportHistory);
$("save-marks").addEventListener("click", async () => {
  try { await saveMarks(); } catch (error) { notice(error.message, true); }
});
$("create-form").addEventListener("submit", async event => {
  event.preventDefault();
  const classId = $("class-select").value;
  const academicTermId = $("term-select").value;
  if (!classId || !academicTermId) { notice("Choose a class and academic term first.", true); return; }
  const form = new FormData(event.currentTarget);
  try {
    const result = await api("/academics/assessments", {
      method: "POST",
      body: {
        classId, academicTermId, assessmentName: form.get("assessmentName"),
        assessmentType: form.get("assessmentType"), assessmentDate: form.get("assessmentDate") || null,
        maxScore: Number(form.get("maxScore"))
      }
    });
    event.currentTarget.reset();
    await loadWorkspace();
    $("assessment-select").value = result.assessment.id;
    await loadSelectedAssessment();
    notice("Draft assessment created.");
  } catch (error) { notice(error.message, true); }
});
async function startWorkspace() {
  $("login").hidden = true;
  $("app").hidden = false;
  $("staff-name").textContent = principal.displayName || "Staff member";
  $("staff-roles").textContent = (principal.roles || []).join(" · ");
  try {
    await loadWorkspace();
    if (workspace.classes.length) {
      $("class-select").value = workspace.classes[0].id;
      await loadWorkspace();
    }
  } catch (error) {
    notice(error.message, true);
  }
}
(async () => {
  try {
    const health = await fetch("/api/v1/health", { cache: "no-store" });
    if (!health.ok) throw new Error("Local API unavailable.");
    const session = await api("/auth/session");
    principal = session.principal;
    await startWorkspace();
  } catch {
    $("login").hidden = false;
    notice("Local academic service ready. Please sign in.");
  }
})();
})();
