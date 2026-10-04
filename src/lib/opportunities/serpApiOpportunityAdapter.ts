import type { DiscoveredOpportunityCandidate } from "./serpApiOpportunityDiscovery"
import type { Opportunity, OpportunityType } from "./opportunityTypes"
import type { StudentContextPayload } from "./opportunityAIService"
import { calculateDeterministicMatch, calculateGoalMatch, type DeterministicMatchResult } from "./deterministicMatcher"
import { requestAI } from "../ai/router-client"
import type { Session } from "@supabase/supabase-js"

export type DiscoveryState = "DISCOVERED"
export type DiscoveryVerificationState = "PENDING_VERIFICATION" | "VERIFIED"
export type DiscoveryRelevanceLabel = "Strong discovery match" | "Possible match" | "Needs verification"

export interface DiscoveredOpportunityMatchResult {
  candidate: DiscoveredOpportunityCandidate
  opportunity: Opportunity
  deterministicMatch: DeterministicMatchResult
  hasStructuredSkills: boolean
  numericScore: number | null // null when structured skills are missing
  relevanceLabel: DiscoveryRelevanceLabel
  discoveryState: DiscoveryState
  verificationState: DiscoveryVerificationState
  provenance: "Discovered via web search"
  explanation: string
}

export interface DiscoveredOpportunityAIExplanation {
  explanation: string
  suggestedVerificationSteps: string[]
  disclaimer: string
}

/**
 * Adapter: Converts a DiscoveredOpportunityCandidate into a canonical StudentOS Opportunity model.
 * STRICT NON-FABRICATION RULE:
 * - eligibility: [] (never invent requirements)
 * - required_skills: [] (never invent skills)
 * - deadline: null (never invent dates)
 * - stipend_prize: null (never invent prizes)
 * - verification_state: "pending" (corresponds to PENDING_VERIFICATION)
 */
export function candidateToOpportunityAdapter(candidate: DiscoveredOpportunityCandidate): Opportunity {
  if (!candidate || !candidate.url || !candidate.title) {
    throw new Error("Invalid candidate: title and url are required")
  }

  const now = candidate.discoveredAt || new Date().toISOString()
  const titleLower = candidate.title.toLowerCase()
  const snippetLower = (candidate.snippet || "").toLowerCase()
  const combined = `${titleLower} ${snippetLower}`

  let type: OpportunityType = "hackathon"
  if (combined.includes("internship") || combined.includes("intern ")) {
    type = "internship"
  } else if (combined.includes("fellowship")) {
    type = "fellowship"
  } else if (combined.includes("grant")) {
    type = "grant"
  } else if (combined.includes("ambassador")) {
    type = "ambassador"
  } else if (combined.includes("competition") || combined.includes("contest")) {
    type = "competition"
  } else if (combined.includes("job") || combined.includes("hiring")) {
    type = "job"
  }

  return {
    id: candidate.id,
    title: candidate.title,
    organization: candidate.source || "Web",
    type,
    category: "Discovered via Search",
    description: candidate.snippet || candidate.title,
    eligibility: [], // Never fabricate
    required_skills: [], // Never fabricate
    location: "Web / Remote",
    stipend_prize: null, // Never fabricate
    source_url: candidate.url,
    source_platform: candidate.source || "SerpApi",
    deadline: null, // Never fabricate
    status: "active",
    verification_state: "pending", // ALWAYS pending verification
    last_verified_at: now,
    created_at: now,
    updated_at: now,
    raw_metadata: {
      provenance: candidate.provenance || "Discovered via web search",
      searchQuery: candidate.searchQuery,
      position: candidate.position,
      displayedLink: candidate.displayedLink,
      discoveryState: "DISCOVERED",
      verificationState: "PENDING_VERIFICATION",
    },
  }
}

/**
 * Connects a DiscoveredOpportunityCandidate to the existing StudentOS Deterministic Matcher.
 * Uses qualitative relevance labels when structured skills are missing.
 */
export function evaluateDiscoveredCandidate(
  candidate: DiscoveredOpportunityCandidate,
  studentContext: StudentContextPayload
): DiscoveredOpportunityMatchResult {
  const opportunity = candidateToOpportunityAdapter(candidate)
  const deterministic = calculateDeterministicMatch(studentContext, opportunity)

  const hasStructuredSkills = opportunity.required_skills.length > 0
  const numericScore: number | null = hasStructuredSkills ? deterministic.match_score : null

  // Calculate goal & keyword alignment
  const goalScore = calculateGoalMatch(studentContext, opportunity)
  const textContent = `${candidate.title} ${candidate.snippet}`.toLowerCase()
  const studentSkills = (studentContext.skills ?? []).map((s) => s.toLowerCase().trim())
  const hasSkillKeywordHit = studentSkills.some((s) => s.length > 1 && textContent.includes(s))

  let relevanceLabel: DiscoveryRelevanceLabel = "Needs verification"
  if (goalScore >= 75 || (goalScore >= 50 && hasSkillKeywordHit)) {
    relevanceLabel = "Strong discovery match"
  } else if (goalScore >= 50 || hasSkillKeywordHit) {
    relevanceLabel = "Possible match"
  }

  const explanation = hasStructuredSkills
    ? deterministic.explanation
    : `Insufficient structured data for deterministic skill match. Goal keyword relevance: ${goalScore}%. Verify details on official opportunity page.`

  return {
    candidate,
    opportunity,
    deterministicMatch: deterministic,
    hasStructuredSkills,
    numericScore,
    relevanceLabel,
    discoveryState: "DISCOVERED",
    verificationState: "PENDING_VERIFICATION",
    provenance: "Discovered via web search",
    explanation,
  }
}

/**
 * AI Enrichment Layer: Generates safe qualitative reasoning for web search discovered candidates based strictly on available evidence.
 * MUST NOT fabricate deadlines, eligibility, skills, or stipends.
 */
export async function generateDiscoveredOpportunityAIExplanation(
  candidate: DiscoveredOpportunityCandidate,
  studentContext: StudentContextPayload,
  session?: Session | null
): Promise<DiscoveredOpportunityAIExplanation> {
  const disclaimer = "Based on the search result snippet. Verify details on official opportunity page."
  const defaultSteps = [
    "Visit the official URL to confirm eligibility criteria and submission guidelines.",
    "Verify application deadlines and official registration requirements.",
    "Check required technical prerequisites or team parameters.",
  ]

  if (!session) {
    return {
      explanation: `Discovered web result '${candidate.title}' from ${candidate.source}. ${disclaimer}`,
      suggestedVerificationSteps: defaultSteps,
      disclaimer,
    }
  }

  const payload = {
    candidate: {
      title: candidate.title,
      source: candidate.source,
      snippet: candidate.snippet,
      searchQuery: candidate.searchQuery,
      url: candidate.url,
    },
    student: {
      skills: studentContext.skills ?? [],
      career_goals: studentContext.careerGoals ?? [],
    },
    instructions:
      "Explain why this web search result might be relevant to the student using ONLY the provided title, snippet, and student context. DO NOT invent deadlines, skills, eligibility, or prizes. Return JSON: { explanation: string, suggestedVerificationSteps: string[] }",
  }

  try {
    const result = await requestAI<{ content: string }>(session, "opportunity_qa", payload)
    const parsed = JSON.parse(result.data.content)
    const explanationText = typeof parsed.explanation === "string" ? parsed.explanation.trim() : ""
    const steps = Array.isArray(parsed.suggestedVerificationSteps) ? parsed.suggestedVerificationSteps : defaultSteps

    return {
      explanation: explanationText ? `${explanationText}\n\n${disclaimer}` : `Discovered web result '${candidate.title}'. ${disclaimer}`,
      suggestedVerificationSteps: steps,
      disclaimer,
    }
  } catch (error) {
    console.warn("AI explanation request failed, using safe fallback explanation:", error)
    return {
      explanation: `Discovered via search query '${candidate.searchQuery}' on ${candidate.source}. ${disclaimer}`,
      suggestedVerificationSteps: defaultSteps,
      disclaimer,
    }
  }
}
