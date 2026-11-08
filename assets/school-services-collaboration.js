// CORNHILL School Services: staff notices, school calendar and staff-only collaboration.
// This module loads after school-services.html's shared Supabase client and auth helpers.

let cachedStaffNotices = [];
let cachedCalendarEvents = [];
let cachedStaffPosts = [];
let cachedStaffComments = [];
let cachedStaffReactions = [];

function audienceRoleValues(value) {
  if (value === "teachers") return ["Teacher"];
  if (value === "admins") return ["Admin"];
  return ["Admin", "Teacher", "Staff"];
}
function audienceBadge(roles) {
  const labels = { Admin: "Administrators", Teacher: "Teachers", Staff: "Staff" };
  return (roles || []).map(role => labels[role] || role).join(", ") || "Selected staff";
}
function kampalaDateTimeValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day + "T" + values.hour + ":" + values.minute;
}
function localDateTimeToIso(value) {
  if (!value) return null;
  // Date/time inputs in this workspace are explicitly interpreted as Uganda time (UTC+03:00).
  const parsed = new Date(value + ":00+03:00");
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid Uganda date and time.");
  return parsed.toISOString();
}
function localTimeLabel(value) {
  return value ? String(value).slice(0, 5) : "";
}
function setDefaultPublicationTimes() {
  if ($("noticePublishAt")) $("noticePublishAt").value = kampalaDateTimeValue();
}
function configureStaffFeedAudience() {
  const select = $("staffPostAudience");
  const allowed = isAdmin() ? ["all_staff", "teachers", "admins"]
    : profile && profile.role === "Teacher" ? ["all_staff", "teachers"] : ["all_staff"];
  Array.from(select.options).forEach(option => { option.disabled = !allowed.includes(option.value); });
  if (!allowed.includes(select.value)) select.value = "all_staff";
}

async function loadStaffNotices() {
  const { data, error } = await db.from("school_staff_notices")
    .select("id,title,body,category,priority,audience_roles,publish_at,expires_at,is_published,created_at")
    .order("publish_at", { ascending: false }).limit(150);
  if (error) {
    $("noticeRows").innerHTML = '<div class="notice error">Notices could not be loaded: ' + esc(error.message) + "</div>";
    return;
  }
  cachedStaffNotices = data || [];
  $("noticeRows").innerHTML = cachedStaffNotices.map(row => {
    const draft = isAdmin() && !row.is_published;
    const action = isAdmin()
      ? '<div class="row" style="gap:7px;flex-wrap:wrap;margin-top:12px"><button type="button" data-notice-toggle="' + esc(row.id) + '">' + (row.is_published ? "Unpublish" : "Publish") + '</button><button type="button" data-notice-delete="' + esc(row.id) + '">Delete</button></div>'
      : "";
    return '<article class="card" style="margin:0;padding:16px;min-width:0"><div class="row" style="align-items:center;justify-content:space-between;gap:8px"><span class="badge">' + esc(row.category) + '</span><span class="badge">' + esc(row.priority) + '</span></div><h3 style="margin:12px 0 7px">' + esc(row.title) + '</h3><p style="white-space:pre-wrap;line-height:1.55">' + esc(row.body) + '</p><p class="muted" style="font-size:11px">Audience: ' + esc(audienceBadge(row.audience_roles)) + "<br>Publication: " + esc(new Date(row.publish_at).toLocaleString("en-GB", { timeZone: "Africa/Kampala" })) + (row.expires_at ? "<br>Expires: " + esc(new Date(row.expires_at).toLocaleString("en-GB", { timeZone: "Africa/Kampala" })) : "") + "<br>Status: " + (draft ? "Draft" : "Published") + "</p>" + action + "</article>";
  }).join("") || '<div class="notice">No published notices are currently available for your staff role.</div>';
}

$("noticeForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    requireAdmin();
    const publishAt = localDateTimeToIso($("noticePublishAt").value) || new Date().toISOString();
    const expiresAt = localDateTimeToIso($("noticeExpiresAt").value);
    if (expiresAt && new Date(expiresAt) <= new Date(publishAt)) throw new Error("Expiry must be later than the publication time.");
    const payload = {
      title: $("noticeTitle").value.trim(), body: $("noticeBody").value.trim(),
      category: $("noticeCategory").value, priority: $("noticePriority").value,
      audience_roles: audienceRoleValues($("noticeAudience").value),
      publish_at: publishAt, expires_at: expiresAt,
      is_published: $("noticeIsPublished").checked, created_by: user.id
    };
    const { error } = await db.from("school_staff_notices").insert(payload);
    if (error) throw error;
    event.target.reset();
    $("noticeIsPublished").checked = true;
    setDefaultPublicationTimes();
    inlineMsg("noticeMsg", "Staff notice saved for the selected active staff audience.", "success");
    await loadStaffNotices();
  } catch (error) {
    inlineMsg("noticeMsg", "Notice was not saved: " + (error.message || "Please try again."), "error");
  }
});

$("noticeRows").addEventListener("click", async event => {
  const toggleId = event.target.closest("[data-notice-toggle]")?.dataset.noticeToggle;
  const deleteId = event.target.closest("[data-notice-delete]")?.dataset.noticeDelete;
  if (!toggleId && !deleteId) return;
  try {
    requireAdmin();
    if (deleteId) {
      if (!confirm("Delete this staff notice permanently?")) return;
      const { error } = await db.from("school_staff_notices").delete().eq("id", deleteId);
      if (error) throw error;
    } else {
      const row = cachedStaffNotices.find(item => item.id === toggleId);
      if (!row) throw new Error("Refresh the notice list and try again.");
      const { error } = await db.from("school_staff_notices").update({
        is_published: !row.is_published, updated_at: new Date().toISOString()
      }).eq("id", toggleId);
      if (error) throw error;
    }
    await loadStaffNotices();
    note("globalMsg", deleteId ? "Staff notice deleted." : "Notice publication status updated.", "success");
  } catch (error) {
    note("globalMsg", "Notice action failed: " + (error.message || "Please try again."), "error");
  }
});

async function loadSchoolCalendar() {
  const { data, error } = await db.from("school_calendar_events")
    .select("id,title,description,event_date,start_time,end_time,venue,audience_roles,is_published,created_at")
    .order("event_date", { ascending: true }).limit(250);
  if (error) {
    $("calendarRows").innerHTML = '<div class="notice error">Calendar could not be loaded: ' + esc(error.message) + "</div>";
    return;
  }
  cachedCalendarEvents = data || [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
  const rows = cachedCalendarEvents.filter(row => isAdmin() || row.event_date >= today);
  $("calendarRows").innerHTML = rows.map(row => {
    const time = [localTimeLabel(row.start_time), localTimeLabel(row.end_time)].filter(Boolean).join(" – ");
    const draft = isAdmin() && !row.is_published;
    const action = isAdmin()
      ? '<div class="row" style="gap:7px;flex-wrap:wrap;margin-top:12px"><button type="button" data-event-toggle="' + esc(row.id) + '">' + (row.is_published ? "Unpublish" : "Publish") + '</button><button type="button" data-event-delete="' + esc(row.id) + '">Delete</button></div>'
      : "";
    return '<article class="card" style="margin:0;padding:16px;min-width:0"><div class="row" style="justify-content:space-between;align-items:center;gap:8px"><span class="badge">' + esc(dateFmt(row.event_date)) + '</span><span class="badge">' + (draft ? "Draft" : "Published") + '</span></div><h3 style="margin:12px 0 7px">' + esc(row.title) + '</h3><p style="white-space:pre-wrap">' + esc(row.description || "") + '</p><p class="muted" style="font-size:11px">' + (time ? "Time: " + esc(time) + "<br>" : "") + (row.venue ? "Venue: " + esc(row.venue) + "<br>" : "") + "Audience: " + esc(audienceBadge(row.audience_roles)) + "</p>" + action + "</article>";
  }).join("") || '<div class="notice">No upcoming calendar events are published for your staff role.</div>';
}

$("calendarForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    requireAdmin();
    const startTime = $("calendarStart").value || null;
    const endTime = $("calendarEnd").value || null;
    if (startTime && endTime && endTime <= startTime) throw new Error("End time must be later than start time.");
    const payload = {
      title: $("calendarTitle").value.trim(),
      description: $("calendarDescription").value.trim() || null,
      event_date: $("calendarDate").value, start_time: startTime, end_time: endTime,
      venue: $("calendarVenue").value.trim() || null,
      audience_roles: audienceRoleValues($("calendarAudience").value),
      is_published: $("calendarIsPublished").checked, created_by: user.id
    };
    const { error } = await db.from("school_calendar_events").insert(payload);
    if (error) throw error;
    event.target.reset();
    $("calendarIsPublished").checked = true;
    inlineMsg("calendarMsg", "School calendar event saved for the selected staff audience.", "success");
    await loadSchoolCalendar();
  } catch (error) {
    inlineMsg("calendarMsg", "Calendar event was not saved: " + (error.message || "Please try again."), "error");
  }
});

$("calendarRows").addEventListener("click", async event => {
  const toggleId = event.target.closest("[data-event-toggle]")?.dataset.eventToggle;
  const deleteId = event.target.closest("[data-event-delete]")?.dataset.eventDelete;
  if (!toggleId && !deleteId) return;
  try {
    requireAdmin();
    if (deleteId) {
      if (!confirm("Delete this calendar event permanently?")) return;
      const { error } = await db.from("school_calendar_events").delete().eq("id", deleteId);
      if (error) throw error;
    } else {
      const row = cachedCalendarEvents.find(item => item.id === toggleId);
      if (!row) throw new Error("Refresh the calendar and try again.");
      const { error } = await db.from("school_calendar_events").update({
        is_published: !row.is_published, updated_at: new Date().toISOString()
      }).eq("id", toggleId);
      if (error) throw error;
    }
    await loadSchoolCalendar();
    note("globalMsg", deleteId ? "Calendar event deleted." : "Calendar publication status updated.", "success");
  } catch (error) {
    note("globalMsg", "Calendar action failed: " + (error.message || "Please try again."), "error");
  }
});

$("refreshNotices").addEventListener("click", loadStaffNotices);
$("refreshCalendar").addEventListener("click", loadSchoolCalendar);
setDefaultPublicationTimes();

// Text-only staff feed reuses existing active-staff-only posts, comments and reactions.
function allowedStaffPostAudience() {
  if (isAdmin()) return ["all_staff", "teachers", "admins"];
  if (profile && profile.role === "Teacher") return ["all_staff", "teachers"];
  return ["all_staff"];
}
function configureStaffFeedAudience() {
  const select = $("staffPostAudience");
  const allowed = allowedStaffPostAudience();
  Array.from(select.options).forEach(option => { option.disabled = !allowed.includes(option.value); });
  if (!allowed.includes(select.value)) select.value = "all_staff";
}
async function loadStaffFeed() {
  if (!isActiveStaff()) return;
  configureStaffFeedAudience();
  const { data: posts, error } = await db.from("staff_communication_posts")
    .select("id,author_user_id,body,audience,is_pinned,created_at")
    .order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(60);
  if (error) {
    $("staffFeedRows").innerHTML = '<div class="notice error">Staff feed could not load: ' + esc(error.message) + "</div>";
    return;
  }
  cachedStaffPosts = posts || [];
  const ids = cachedStaffPosts.map(row => row.id);
  if (!ids.length) {
    cachedStaffComments = [];
    cachedStaffReactions = [];
    $("staffFeedRows").innerHTML = '<div class="notice">No staff updates yet. Share the first work update with your permitted audience.</div>';
    return;
  }
  const [comments, reactions] = await Promise.all([
    db.from("staff_communication_comments").select("id,post_id,author_user_id,body,created_at").in("post_id", ids).order("created_at", { ascending: true }),
    db.from("staff_communication_reactions").select("post_id,user_id,reaction").in("post_id", ids)
  ]);
  if (comments.error || reactions.error) {
    $("staffFeedRows").innerHTML = '<div class="notice error">Posts loaded, but comments or reactions could not be read.</div>';
    return;
  }
  cachedStaffComments = comments.data || [];
  cachedStaffReactions = reactions.data || [];
  $("staffFeedRows").innerHTML = cachedStaffPosts.map(post => {
    const thread = cachedStaffComments.filter(row => row.post_id === post.id);
    const reactionsForPost = cachedStaffReactions.filter(row => row.post_id === post.id);
    const likeCount = reactionsForPost.filter(row => row.reaction === "like").length;
    const mine = reactionsForPost.find(row => row.user_id === user.id);
    const audience = { all_staff: "All staff", teachers: "Teachers", admins: "Administrators" }[post.audience] || post.audience;
    const commentsHtml = thread.map(comment =>
      '<div style="padding:8px 0;border-top:1px solid var(--line)"><strong>' + (comment.author_user_id === user.id ? "You" : "Staff member") + '</strong><p style="margin:4px 0;white-space:pre-wrap">' + esc(comment.body) + '</p><small class="muted">' + esc(new Date(comment.created_at).toLocaleString("en-GB")) + "</small></div>"
    ).join("");
    return '<article class="card" style="margin:0;padding:15px;min-width:0"><div class="row" style="align-items:center;justify-content:space-between;gap:8px"><strong>' + (post.author_user_id === user.id ? "You" : "Staff member") + '</strong><span class="badge">' + esc(audience) + '</span></div><p style="white-space:pre-wrap;line-height:1.6;margin:12px 0">' + esc(post.body) + '</p><small class="muted">' + esc(new Date(post.created_at).toLocaleString("en-GB")) + (post.is_pinned ? " · Pinned" : "") + '</small><div class="row" style="gap:8px;align-items:center;margin:12px 0"><button type="button" data-feed-like="' + esc(post.id) + '">' + (mine?.reaction === "like" ? "Liked" : "Like") + " · " + likeCount + '</button></div><div>' + commentsHtml + '</div><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input data-feed-comment-input="' + esc(post.id) + '" maxlength="2000" placeholder="Write a work-related comment…" style="flex:1;min-width:180px"><button type="button" data-feed-comment="' + esc(post.id) + '">Comment</button></div></article>';
  }).join("") || '<div class="notice">No staff updates are available to this account role.</div>';
}

$("staffPostForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    if (!isActiveStaff()) throw new Error("An active staff account is required.");
    const audience = $("staffPostAudience").value;
    if (!allowedStaffPostAudience().includes(audience)) throw new Error("Your staff role cannot publish to that audience.");
    const body = $("staffPostBody").value.trim();
    if (!body || body.length > 5000) throw new Error("Enter a work update of up to 5,000 characters.");
    const { error } = await db.from("staff_communication_posts").insert({
      author_user_id: user.id, body, audience, is_pinned: false
    });
    if (error) throw error;
    event.target.reset();
    configureStaffFeedAudience();
    inlineMsg("staffPostMsg", "Staff update published to its permitted audience.", "success");
    await loadStaffFeed();
  } catch (error) {
    inlineMsg("staffPostMsg", "Staff update was not published: " + (error.message || "Please try again."), "error");
  }
});

$("staffFeedRows").addEventListener("click", async event => {
  const likeId = event.target.closest("[data-feed-like]")?.dataset.feedLike;
  const commentId = event.target.closest("[data-feed-comment]")?.dataset.feedComment;
  try {
    if (likeId) {
      if (!isActiveStaff()) throw new Error("Active staff access is required.");
      const own = cachedStaffReactions.find(row => row.post_id === likeId && row.user_id === user.id);
      const result = own
        ? await db.from("staff_communication_reactions").delete().eq("post_id", likeId).eq("user_id", user.id)
        : await db.from("staff_communication_reactions").upsert({ post_id: likeId, user_id: user.id, reaction: "like" }, { onConflict: "post_id,user_id" });
      if (result.error) throw result.error;
      await loadStaffFeed();
      return;
    }
    if (commentId) {
      if (!isActiveStaff()) throw new Error("Active staff access is required.");
      const input = $("staffFeedRows").querySelector('[data-feed-comment-input="' + CSS.escape(commentId) + '"]');
      const body = input?.value.trim() || "";
      if (!body) throw new Error("Enter a short work-related comment.");
      const { error } = await db.from("staff_communication_comments").insert({
        post_id: commentId, author_user_id: user.id, body
      });
      if (error) throw error;
      await loadStaffFeed();
    }
  } catch (error) {
    note("globalMsg", "Staff feed action failed: " + (error.message || "Please try again."), "error");
  }
});
$("refreshStaffFeed").addEventListener("click", loadStaffFeed);
