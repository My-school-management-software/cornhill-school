# CORNHILL Cloudflare R2 setup

Status: code integration prepared; provider account and bucket credentials are not yet connected.

## Free allowance

Cloudflare's published R2 Standard storage free allowance is 10 GB-month, 1 million Class A operations and 10 million Class B operations per month. Internet egress is free. The free allowance does not apply to the Infrequent Access storage class. Usage above the allowance is billable, so enable budget/usage alerts and review the R2 dashboard each month.

## 1. Create the private bucket

In the authorised school Cloudflare account:
1. Open R2 Object Storage.
2. Activate R2. Cloudflare may request billing-profile or payment details before API token creation; an authorised adult/account owner should handle any such step.
3. Create a bucket named `cornhill-school-evidence`.
4. Keep the bucket private. Do not enable public access or a public custom domain.
5. Choose the Standard storage class (the free allowance does not cover Infrequent Access).

## 2. Create a narrowly scoped R2 API token

Create an R2 API token with Object Read & Write permission, scoped to the single `cornhill-school-evidence` bucket. Do not use an account-wide Cloudflare Global API key.

Copy the Access Key ID and Secret Access Key once. Never paste them into chat, GitHub, browser JavaScript, a school document or a screenshot.

## 3. Add server-side secrets in Supabase

In Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets, add:

- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME` = `cornhill-school-evidence`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Keep the values server-side. Do not add any of these values to Vercel environment variables or frontend source. The gateway is designed to return only whether configuration exists, never the values.

## 4. Configure private bucket CORS

Add a CORS rule on the bucket allowing browser uploads from these exact school origins:

- `https://evidence-cornhill-school.vercel.app`
- `https://cornhill-school-swart.vercel.app`

For preview testing, add only the exact Vercel preview origin being tested, then remove it when no longer needed.

Allowed methods: `PUT`, `GET`, `HEAD`.
Allowed headers: `Content-Type`.
Expose headers: `ETag`.
Max age: `3600`.

Do not use wildcard origins for learner, staff or financial evidence.

## 5. Verify before routing live uploads

1. Confirm the administrator-only status check reports R2 configured.
2. Upload a harmless test PDF to a test evidence request.
3. Verify the file's content type and byte size.
4. Download it through the short-lived signed URL.
5. Confirm an unauthorised account cannot obtain a signed URL.
6. Confirm the object stays private and that the Supabase metadata record points to the R2 path.
7. Only then let new evidence use R2.

Existing Supabase files are not migrated or deleted. CORNHILL uses R2 only for new evidence uploads when the gateway reports that the provider is configured; otherwise it continues using the current private Supabase bucket.

## Architecture and safety

- Credentials are stored only as Supabase Edge Function secrets.
- Signed upload URLs expire after 5 minutes; signed download URLs expire after 10 minutes.
- Only active CORNHILL staff can call the gateway.
- Uploads are restricted to the request creator or the active staff member and device assigned to that pending request.
- Files are limited to JPG, PNG, WebP and PDF, no larger than 15 MB each.
- The R2 object key is request-scoped and cannot be selected freely by a browser.
- The database keeps evidence metadata; R2 stores file bytes.
- Do not delete old Supabase objects as part of this integration.
