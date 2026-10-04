import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
const error = (message: string, status = 500, details?: unknown) => json({ success: false, error: message, details }, status)

Deno.serve(async (request) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers })
  }

  if (request.method !== "POST" && request.method !== "GET") {
    return error("Method not allowed", 405)
  }

  // Optional Supabase user auth validation
  const authorization = request.headers.get("Authorization")
  if (!authorization) {
    return error("Unauthorized: Missing Authorization header", 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

  if (supabaseUrl && supabaseAnonKey) {
    const db = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: auth, error: authError } = await db.auth.getUser()
    if (authError || !auth.user) {
      return error("Unauthorized: Invalid session or user", 401)
    }
  }

  // Load server-only secret from Supabase Edge Function environment
  const serpApiKey = Deno.env.get("SERPAPI_API_KEY")

  // Check if secret is configured
  if (!serpApiKey) {
    return json(
      {
        success: false,
        configured: false,
        error: "SERPAPI_API_KEY is not configured in Supabase Edge Function secrets.",
        instruction: "Run 'supabase secrets set SERPAPI_API_KEY=your-serpapi-api-key' in your CLI.",
      },
      500
    )
  }

  // Parse request body or URL parameters
  let action: string | undefined
  let query: string | undefined
  let engine: string = "google"
  let location: string | undefined
  let num: number = 10

  if (request.method === "POST") {
    try {
      const body = await request.json()
      action = body.action
      query = body.query
      if (body.engine) engine = body.engine
      if (body.location) location = body.location
      if (body.num) num = Number(body.num) || 10
    } catch {
      return error("Invalid JSON request body", 400)
    }
  } else if (request.method === "GET") {
    const url = new URL(request.url)
    action = url.searchParams.get("action") || undefined
    query = url.searchParams.get("query") || url.searchParams.get("q") || undefined
    if (url.searchParams.get("engine")) engine = url.searchParams.get("engine")!
    if (url.searchParams.get("location")) location = url.searchParams.get("location")!
    if (url.searchParams.get("num")) num = Number(url.searchParams.get("num")) || 10
  }

  // Action: Verification mode (check if secret is readable by function)
  if (action === "verify" || action === "check_config" || (!query && action !== "search")) {
    return json({
      success: true,
      configured: true,
      message: "SERPAPI_API_KEY secret is verified and available in Supabase Edge Function environment.",
      engine,
    })
  }

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return error("Search query string 'query' is required", 400)
  }

  // Server-side SerpApi API call
  try {
    const serpUrl = new URL("https://serpapi.com/search.json")
    serpUrl.searchParams.set("engine", engine)
    serpUrl.searchParams.set("q", query.trim())
    serpUrl.searchParams.set("api_key", serpApiKey)
    serpUrl.searchParams.set("num", String(num))
    if (location) serpUrl.searchParams.set("location", location)

    const serpRes = await fetch(serpUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })

    const serpData = await serpRes.json().catch(() => null)

    if (!serpRes.ok) {
      const errMsg = serpData?.error || `SerpApi upstream request failed with HTTP ${serpRes.status}`
      console.error(JSON.stringify({ event: "serpapi_error", status: serpRes.status, error: errMsg }))
      return error(errMsg, 502, serpData)
    }

    console.info(JSON.stringify({ event: "serpapi_success", query, engine, resultsCount: serpData?.organic_results?.length ?? 0 }))

    return json({
      success: true,
      configured: true,
      query,
      engine,
      search_metadata: serpData?.search_metadata,
      search_information: serpData?.search_information,
      organic_results: serpData?.organic_results || [],
      answer_box: serpData?.answer_box || null,
      knowledge_graph: serpData?.knowledge_graph || null,
      raw: serpData,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ event: "serpapi_exception", error: message }))
    return error(`Failed to execute SerpApi request: ${message}`, 500)
  }
})
