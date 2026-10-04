import { supabase } from "../supabase"

export interface SerpApiSearchResult {
  title?: string
  link?: string
  snippet?: string
  displayed_link?: string
  position?: number
  [key: string]: unknown
}

export interface SerpApiResponse {
  success: boolean
  configured: boolean
  message?: string
  query?: string
  engine?: string
  organic_results?: SerpApiSearchResult[]
  answer_box?: Record<string, unknown> | null
  knowledge_graph?: Record<string, unknown> | null
  error?: string
  instruction?: string
  details?: unknown
}

export interface SerpApiSearchOptions {
  engine?: string
  location?: string
  num?: number
}

/**
  * Verifies if the SERPAPI_API_KEY secret is configured in the Supabase Edge Function environment.
  * Note: Secrets are NEVER exposed to client code or environment files.
  */
export async function verifySerpApiSecret(): Promise<{ configured: boolean; message: string; error?: string }> {
  if (!supabase) {
    return {
      configured: false,
      message: "Supabase client not initialized.",
      error: "VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing.",
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke<SerpApiResponse>("serpapi-search", {
      body: { action: "verify" },
    })

    if (error) {
      return {
        configured: false,
        message: "Failed to invoke serpapi-search edge function",
        error: error.message,
      }
    }

    if (data?.configured) {
      return {
        configured: true,
        message: data.message || "SERPAPI_API_KEY is configured in Supabase Edge Function secrets.",
      }
    }

    return {
      configured: false,
      message: data?.error || "SERPAPI_API_KEY is not configured.",
      error: data?.instruction,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      configured: false,
      message: "Error verifying SerpApi edge function configuration",
      error: message,
    }
  }
}

/**
  * Server-side search execution via Supabase Edge Function.
  * Ensures SERPAPI_API_KEY is NEVER sent or exposed in browser code.
  */
export async function searchSerpApi(query: string, options: SerpApiSearchOptions = {}): Promise<SerpApiResponse> {
  if (!supabase) {
    return {
      success: false,
      configured: false,
      error: "Supabase client not initialized.",
    }
  }

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      configured: false,
      error: "Query parameter cannot be empty.",
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke<SerpApiResponse>("serpapi-search", {
      body: {
        action: "search",
        query: query.trim(),
        engine: options.engine || "google",
        location: options.location,
        num: options.num || 10,
      },
    })

    if (error) {
      return {
        success: false,
        configured: false,
        error: error.message,
      }
    }

    return data || { success: false, configured: false, error: "Empty response from Edge Function" }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      configured: false,
      error: message,
    }
  }
}
