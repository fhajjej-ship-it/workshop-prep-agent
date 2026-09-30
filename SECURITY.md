# Security

## Report a vulnerability

Use **Security → Report a vulnerability** on this GitHub repository for a private report. Include affected code, reproduction steps, impact and suggested mitigation. Do not post credentials, private documents or exploit details in a public issue.

If a credential is exposed, revoke or rotate it with its provider immediately. Deleting a file or commit does not invalidate it or erase copies already obtained.

## Deployment boundaries

- This demonstration has no sign-in or private workspace access. Anyone with a saved workshop URL can read its pack and selected source text.
- Browser-management cookies authorize rename/delete actions; they do not provide private read access. Browser history is not an account.
- Selected source text is stored with the workshop. Live preparation sends it to Google. Upload extraction alone does not call the model; original uploaded files are not retained.
- Keep keys and database credentials in server-side environment variables. Never expose them through `NEXT_PUBLIC_` variables, logs, screenshots or reports.
- Use your own database and credentials. Apply reviewed schemas explicitly. Public source does not grant access to the maintainer's infrastructure.
- Source materials and model output are untrusted. Automated reviews can miss errors; inspect content before use.
- The optional daily allowance limits new preparation starts across visitors, not exact costs or per-user usage. Set provider-side budgets appropriate to your deployment.

Use fictional, non-sensitive materials in a public demo. Confidential-material deployments need authentication and read authorization before accepting them.
