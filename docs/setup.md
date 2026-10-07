# Setup and deployment

## Local setup

1. Install Node.js 20+ and the Supabase CLI.
2. Clone the repo and run `npm install`.
3. Copy `.env.example` to `.env.local` and add public Supabase values.
4. Create/link a Supabase project: `supabase link --project-ref <ref>`.
5. Run `supabase db push` to apply tables, indexes, and RLS policies.
6. Add the AI secret: `supabase secrets set GEMINI_API_KEY=<key>`.
7. Deploy or serve functions locally: `supabase functions serve`.
8. Start the UI: `npm run dev`.
9. Validate: `npm run build` and `npm run lint`.

Authentication is required in every environment. Create a test user in Supabase Auth for local development; do not add an authentication bypass.

## Deployment

**Frontend:** import the repository in Vercel, set the two `VITE_SUPABASE_*` variables, build with `npm run build`, and publish `dist`. Configure the deployment URL in Supabase Auth redirect URLs.

**Backend:** run `supabase db push`, set the Gemini secret, then deploy `ai-router` and `ai-configuration`. Confirm `/ai-configuration` reports `configured: true` while authenticated.

## Google OAuth Setup Checklist

To enable Google Sign-In in production and local environments:

1. **Google Cloud Console Setup**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
   - Create an **OAuth 2.0 Client ID** with Application Type: **Web application**.
   - Add Authorized Redirect URIs:
     `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
   - Save your **Client ID** and **Client Secret**.

2. **Supabase Provider Setup**:
   - Open [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **Providers** → **Google**.
   - Toggle **Enable Google provider**.
   - Enter your Google **Client ID** and **Client Secret**.
   - Copy the callback URL displayed and confirm it matches the URI set in Google Cloud Console.

3. **Supabase URL Configuration**:
   - Go to **Authentication** → **URL Configuration**.
   - Set **Site URL**: `https://studentos-ai-phi.vercel.app`
   - Add **Redirect URLs**:
     - `https://studentos-ai-phi.vercel.app/auth`
     - `http://localhost:5173/auth`
     - `https://studentos-ai-phi.vercel.app/**`
     - `http://localhost:5173/**`

> **Note**: Never put Google Client ID or Client Secret in `VITE_` frontend environment variables or client-side code. Secrets are securely managed strictly inside Supabase Auth.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| “Supabase is not configured” | `.env.local`, Vite restart, and the `VITE_` prefix |
| AI generation fails | deployed `ai-router`, access token, and `GEMINI_API_KEY` Supabase secret |
| Empty workspace | sign in with the intended account and create initial workspace data |
| RLS error | table policy, authenticated session, and matching `user_id` |
| Build failure | Node version, clean install, then `npm run build` |
