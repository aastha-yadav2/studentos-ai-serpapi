import { searchSerpApi, type SerpApiSearchResult } from "../serpapi/serpapiService"
import type { StudentContextPayload } from "./opportunityAIService"
import type { Opportunity, OpportunityType } from "./opportunityTypes"

export type InferredOpportunityType =
  | "Internship"
  | "Hackathon"
  | "Fellowship"
  | "Scholarship"
  | "Developer Program"
  | "Competition"
  | "Opportunity"

export interface DiscoveredOpportunityCandidate {
  id: string
  title: string
  url: string
  snippet: string
  source: string // Domain / platform name (e.g., "devpost.com", "unstop.com")
  position: number
  displayedLink?: string
  searchQuery: string
  discoveredAt: string
  provenance: "Discovered via web search"
  inferredTypeSignal?: InferredOpportunityType
}

export interface DiscoveryOptions {
  maxQueries?: number
  numResultsPerQuery?: number
  engine?: string
  location?: string
  forceFresh?: boolean
}

export interface DiscoveryResult {
  success: boolean
  candidates: DiscoveredOpportunityCandidate[]
  queriesUsed: string[]
  totalRawResults: number
  deduplicatedCount: number
  cached?: boolean
  error?: string
}

// Short-lived in-memory session cache to avoid duplicate network calls
const DISCOVERY_SESSION_CACHE = new Map<string, { result: DiscoveryResult; timestamp: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes TTL

/**
 * Lightweight inferred opportunity-type classification signal from title & snippet keywords.
 * Defaults to "Opportunity" when confidence is insufficient.
 */
export function inferOpportunityTypeSignal(title: string, snippet: string): InferredOpportunityType {
  const text = `${title} ${snippet}`.toLowerCase()
  if (text.includes("internship") || text.includes("intern ") || text.includes("co-op")) return "Internship"
  if (text.includes("hackathon") || text.includes("hack ") || text.includes("buildathon")) return "Hackathon"
  if (text.includes("fellowship")) return "Fellowship"
  if (text.includes("scholarship") || text.includes("bursary") || text.includes("grant")) return "Scholarship"
  if (text.includes("program") || text.includes("ambassador") || text.includes("student club") || text.includes("community leader")) return "Developer Program"
  if (text.includes("competition") || text.includes("contest") || text.includes("challenge")) return "Competition"
  return "Opportunity"
}

/**
 * Normalizes a URL for deduplication.
 * - Strips protocol (http/https)
 * - Lowercases hostname
 * - Removes trailing slash
 * - Removes common tracking/marketing parameters (utm_*, ref, source, gclid, etc.)
 */
export function normalizeUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return ""
  let trimmed = urlStr.trim()
  if (!trimmed) return ""

  try {
    // Add protocol if missing for URL parser
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      trimmed = "https://" + trimmed
    }

    const parsed = new URL(trimmed)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")

    // Filter tracking parameters
    const trackingParams = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "fbclid",
      "gclid",
      "gbraid",
      "wbraid",
      "msclkid",
      "yclid",
    ])

    const searchParams = new URLSearchParams()
    parsed.searchParams.forEach((value, key) => {
      if (!trackingParams.has(key.toLowerCase())) {
        searchParams.append(key, value)
      }
    })

    searchParams.sort()
    const queryString = searchParams.toString()
    let pathname = parsed.pathname

    // Remove trailing slash
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1)
    }

    return `${host}${pathname}${queryString ? "?" + queryString : ""}`
  } catch {
    // Fallback normalization if URL constructor fails
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "")
  }
}

/**
 * Normalizes title string for secondary deduplication.
 */
export function normalizeTitle(title: string): string {
  if (!title || typeof title !== "string") return ""
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse whitespace
}

/**
 * Normalizes domain / source for secondary deduplication.
 */
export function extractDomain(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return "web"
  try {
    let fullUrl = urlStr.trim()
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
      fullUrl = "https://" + fullUrl
    }
    const host = new URL(fullUrl).hostname.toLowerCase()
    return host.replace(/^www\./, "")
  } catch {
    return "web"
  }
}

/**
 * Primary & Secondary Deduplication of Discovered Candidates.
 */
export function deduplicateCandidates(
  candidates: DiscoveredOpportunityCandidate[]
): DiscoveredOpportunityCandidate[] {
  const seenUrls = new Set<string>()
  const seenTitleDomain = new Set<string>()
  const deduplicated: DiscoveredOpportunityCandidate[] = []

  for (const candidate of candidates) {
    if (!candidate.url || !candidate.title) continue

    const normUrl = normalizeUrl(candidate.url)
    if (!normUrl || seenUrls.has(normUrl)) continue

    const normTitle = normalizeTitle(candidate.title)
    const normDomain = candidate.source.toLowerCase()
    const titleDomainKey = `${normTitle}|${normDomain}`

    if (seenTitleDomain.has(titleDomainKey)) continue

    seenUrls.add(normUrl)
    seenTitleDomain.add(titleDomainKey)
    deduplicated.push(candidate)
  }

  return deduplicated
}

/**
 * Converts raw SerpApi search result into a normalized DiscoveredOpportunityCandidate.
 * Strict Rule: Only uses facts present in raw result (no invented deadlines, skills, or requirements).
 * Lightweight quality filtering skips empty titles or malformed URLs.
 */
export function normalizeSerpApiResult(
  result: SerpApiSearchResult,
  searchQuery: string
): DiscoveredOpportunityCandidate | null {
  if (!result || typeof result !== "object") return null

  const rawUrl = typeof result.link === "string" ? result.link.trim() : ""
  const rawTitle = typeof result.title === "string" ? result.title.trim() : ""

  if (!rawUrl || !rawTitle || rawTitle.length < 3 || !rawUrl.includes(".")) return null

  const snippet = typeof result.snippet === "string" ? result.snippet.trim() : ""
  const displayedLink = typeof result.displayed_link === "string" ? result.displayed_link.trim() : undefined
  const position = typeof result.position === "number" ? result.position : 1
  const domain = extractDomain(rawUrl)
  const inferredTypeSignal = inferOpportunityTypeSignal(rawTitle, snippet)

  // Generate deterministic candidate ID from normalized URL
  const normUrl = normalizeUrl(rawUrl)
  const id = `disc_${normUrl.replace(/[^a-z0-9]/gi, "_").slice(0, 60)}`

  return {
    id,
    title: rawTitle,
    url: rawUrl,
    snippet,
    source: domain,
    position,
    displayedLink,
    searchQuery,
    discoveredAt: new Date().toISOString(),
    provenance: "Discovered via web search",
    inferredTypeSignal,
  }
}

/**
 * Generates personalized, targeted search queries based on student context.
 * Strictly bounds total queries to avoid API rate limits (max 2 queries).
 */
export function generatePersonalizedSearchQueries(
  context: StudentContextPayload,
  options: { maxQueries?: number } = {}
): string[] {
  const maxQueries = Math.min(2, Math.max(1, options.maxQueries ?? 2)) // Strictly max 2
  const queries: string[] = []

  const skills = (context.skills ?? []).filter((s) => s.trim().length > 0)
  const goals = (context.careerGoals ?? []).filter((g) => g.trim().length > 0)
  const internships = (context.internshipInterests ?? []).filter((i) => i.trim().length > 0)
  const hackathons = (context.hackathonInterests ?? []).filter((h) => h.trim().length > 0)

  // 1. Skill & Goal combo query
  if (skills.length > 0 || goals.length > 0) {
    const topSkills = skills.slice(0, 2).join(" ")
    const topGoal = goals[0] ?? "developer opportunities"
    queries.push(`${topSkills} ${topGoal} students 2026`.trim())
  }

  // 2. Specific interest / Hackathon query
  if (hackathons.length > 0) {
    queries.push(`${hackathons[0]} hackathons students 2026`.trim())
  } else if (internships.length > 0) {
    queries.push(`${internships[0]} internships students 2026`.trim())
  }

  // 3. Fallback / General student query if queries list is sparse
  if (queries.length < maxQueries) {
    if (skills.length > 0) {
      queries.push(`${skills[0]} student developer programs 2026`.trim())
    } else {
      queries.push("tech hackathons internships students 2026")
    }
  }

  // Deduplicate and cap at maxQueries
  const uniqueQueries = Array.from(new Set(queries)).slice(0, maxQueries)
  return uniqueQueries.length > 0 ? uniqueQueries : ["student tech opportunities 2026"]
}

/**
 * Main Discovery Service function.
 * Accepts search query or queries, invokes secure Edge Function via searchSerpApi,
 * normalizes results, and applies deduplication.
 * Includes short-lived in-memory caching to protect API limits.
 */
export async function discoverFreshOpportunities(
  queriesOrContext: string | string[] | StudentContextPayload,
  options: DiscoveryOptions = {}
): Promise<DiscoveryResult> {
  const maxQueries = Math.min(2, Math.max(1, options.maxQueries ?? 2))
  let queries: string[] = []

  if (typeof queriesOrContext === "string") {
    queries = [queriesOrContext.trim()]
  } else if (Array.isArray(queriesOrContext)) {
    queries = queriesOrContext.map((q) => q.trim()).filter((q) => q.length > 0)
  } else if (typeof queriesOrContext === "object" && queriesOrContext !== null) {
    queries = generatePersonalizedSearchQueries(queriesOrContext, { maxQueries })
  }

  queries = Array.from(new Set(queries)).slice(0, maxQueries)

  if (queries.length === 0) {
    return {
      success: false,
      candidates: [],
      queriesUsed: [],
      totalRawResults: 0,
      deduplicatedCount: 0,
      error: "No valid search queries provided or generated.",
    }
  }

  // Check in-memory session cache unless forceFresh is requested
  const cacheKey = queries.sort().join("|")
  const cachedEntry = DISCOVERY_SESSION_CACHE.get(cacheKey)
  if (!options.forceFresh && cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
    return { ...cachedEntry.result, cached: true }
  }

  const rawCandidates: DiscoveredOpportunityCandidate[] = []
  let totalRawResults = 0

  for (const query of queries) {
    try {
      const response = await searchSerpApi(query, {
        engine: options.engine || "google",
        location: options.location,
        num: options.numResultsPerQuery || 10,
      })

      if (!response.success || !Array.isArray(response.organic_results)) {
        console.warn(`Discovery search query '${query}' returned no results or error:`, response.error)
        continue
      }

      totalRawResults += response.organic_results.length

      for (const result of response.organic_results) {
        const candidate = normalizeSerpApiResult(result, query)
        if (candidate) {
          rawCandidates.push(candidate)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Error executing discovery query '${query}':`, msg)
    }
  }

  const deduplicated = deduplicateCandidates(rawCandidates)

  const finalResult: DiscoveryResult = {
    success: true,
    candidates: deduplicated,
    queriesUsed: queries,
    totalRawResults,
    deduplicatedCount: deduplicated.length,
    cached: false,
  }

  // Save to in-memory session cache
  if (finalResult.success && finalResult.candidates.length > 0) {
    DISCOVERY_SESSION_CACHE.set(cacheKey, { result: finalResult, timestamp: Date.now() })
  }

  return finalResult
}

/**
 * Optional converter: Transforms a DiscoveredOpportunityCandidate into the canonical StudentOS Opportunity shape
 * for downstream matching or display while strictly maintaining safety/provenance rules.
 * Does NOT invent missing facts (skills, eligibility, deadlines).
 */
export function candidateToOpportunity(candidate: DiscoveredOpportunityCandidate): Opportunity {
  const now = new Date().toISOString()

  let type: OpportunityType = "hackathon"
  const signal = candidate.inferredTypeSignal?.toLowerCase() || ""
  if (signal.includes("internship")) {
    type = "internship"
  } else if (signal.includes("fellowship")) {
    type = "fellowship"
  } else if (signal.includes("scholarship")) {
    type = "grant"
  } else if (signal.includes("program")) {
    type = "ambassador"
  } else if (signal.includes("competition")) {
    type = "competition"
  }

  return {
    id: candidate.id,
    title: candidate.title,
    organization: candidate.source,
    type,
    category: "Discovered via Search",
    description: candidate.snippet || candidate.title,
    eligibility: ["Discovered via web search"],
    required_skills: [], // NEVER invent skills
    location: "Web / Remote",
    stipend_prize: null, // NEVER invent prize
    source_url: candidate.url,
    source_platform: candidate.source,
    deadline: null, // NEVER invent deadline
    status: "active",
    verification_state: "pending", // ALWAYS pending verification
    last_verified_at: now,
    created_at: now,
    updated_at: now,
    raw_metadata: {
      provenance: candidate.provenance,
      searchQuery: candidate.searchQuery,
      position: candidate.position,
      displayedLink: candidate.displayedLink,
      discoveredAt: candidate.discoveredAt,
      inferredTypeSignal: candidate.inferredTypeSignal,
    },
  }
}
