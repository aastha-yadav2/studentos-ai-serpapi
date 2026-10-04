import {
  generatePersonalizedSearchQueries,
  deduplicateCandidates,
  normalizeSerpApiResult,
  inferOpportunityTypeSignal,
  discoverFreshOpportunities,
  type DiscoveredOpportunityCandidate,
} from "./serpApiOpportunityDiscovery"
import { evaluateDiscoveredCandidate } from "./serpApiOpportunityAdapter"

export async function testPhase5Suite() {
  console.log("=== RUNNING PHASE 5 PRODUCTION VALIDATION & QUALITY TEST SUITE ===")

  // 1. Personalized Query Generation & Bounded Query Count
  console.log("1. Testing Bounded Personalized Query Generation...")
  const student = {
    skills: ["Python", "React", "Machine Learning"],
    careerGoals: ["AI Researcher"],
    hackathonInterests: ["Generative AI Hackathon"],
  }
  const queries = generatePersonalizedSearchQueries(student, { maxQueries: 2 })
  if (queries.length > 2) {
    throw new Error(`BOUND VIOLATION: generated ${queries.length} queries, max limit is 2`)
  }
  if (!queries[0] || queries[0].length < 5) {
    throw new Error("Generated query is too short or empty")
  }
  console.log(`✓ Query generation passed: ${JSON.stringify(queries)} (strictly bounded to max 2)`)

  // 2. Inferred Opportunity Type Signals
  console.log("2. Testing Inferred Opportunity Type Classification Signals...")
  const type1 = inferOpportunityTypeSignal("Global AI Hackathon 2026", "Compete in 48 hour hackathon")
  const type2 = inferOpportunityTypeSignal("Summer Software Engineering Internship", "Paid 12 week internship")
  const type3 = inferOpportunityTypeSignal("MLH Fellowship Program", "Open source fellowship")
  const type4 = inferOpportunityTypeSignal("Generic Web Page Title", "Random description text without keywords")

  if (type1 !== "Hackathon") throw new Error(`Expected 'Hackathon', got '${type1}'`)
  if (type2 !== "Internship") throw new Error(`Expected 'Internship', got '${type2}'`)
  if (type3 !== "Fellowship") throw new Error(`Expected 'Fellowship', got '${type3}'`)
  if (type4 !== "Opportunity") throw new Error(`Expected fallback 'Opportunity', got '${type4}'`)
  console.log("✓ Inferred opportunity type signals passed (defaults to 'Opportunity' when confidence is low)")

  // 3. Result Quality Filtering & Malformed Item Rejection
  console.log("3. Testing Result Quality Filtering...")
  const validItem = normalizeSerpApiResult({ title: "Valid Title", link: "https://example.com/opp" }, "query")
  const emptyTitleItem = normalizeSerpApiResult({ title: "  ", link: "https://example.com/opp" }, "query")
  const invalidUrlItem = normalizeSerpApiResult({ title: "Valid Title", link: "not-a-valid-url" }, "query")

  if (!validItem) throw new Error("Valid item normalization failed")
  if (emptyTitleItem !== null) throw new Error("Quality filter failed: empty title must return null")
  if (invalidUrlItem !== null) throw new Error("Quality filter failed: invalid URL must return null")
  console.log("✓ Quality filtering passed (rejects malformed URLs and empty titles)")

  // 4. Primary & Secondary Deduplication
  console.log("4. Testing Deduplication...")
  const itemsToDedupe: DiscoveredOpportunityCandidate[] = [
    {
      id: "1",
      title: "Devpost AI Challenge 2026",
      url: "https://devpost.com/hackathons/ai-2026?utm_source=test",
      snippet: "AI hackathon",
      source: "devpost.com",
      position: 1,
      searchQuery: "ai hackathon",
      discoveredAt: new Date().toISOString(),
      provenance: "Discovered via web search",
      inferredTypeSignal: "Hackathon",
    },
    {
      id: "2",
      title: "Devpost AI Challenge 2026",
      url: "http://devpost.com/hackathons/ai-2026",
      snippet: "Duplicate URL",
      source: "devpost.com",
      position: 2,
      searchQuery: "ai hackathon",
      discoveredAt: new Date().toISOString(),
      provenance: "Discovered via web search",
      inferredTypeSignal: "Hackathon",
    },
  ]
  const deduped = deduplicateCandidates(itemsToDedupe)
  if (deduped.length !== 1) throw new Error(`Deduplication failed: expected 1, got ${deduped.length}`)
  console.log("✓ Deduplication passed")

  // 5. Evaluation & Non-Fabrication Rules
  console.log("5. Testing Adapter Evaluation & Pending Verification State...")
  const evaluated = evaluateDiscoveredCandidate(validItem, student)
  if (evaluated.provenance !== "Discovered via web search") throw new Error("Provenance tag mismatch")
  if (evaluated.verificationState !== "PENDING_VERIFICATION") throw new Error("Verification state must be PENDING_VERIFICATION")
  if (evaluated.opportunity.required_skills.length !== 0) throw new Error("FABRICATION FAILURE: required_skills must be empty")
  if (evaluated.opportunity.eligibility.length !== 0) throw new Error("FABRICATION FAILURE: eligibility must be empty")
  if (evaluated.opportunity.deadline !== null) throw new Error("FABRICATION FAILURE: deadline must be null")
  if (evaluated.numericScore !== null) throw new Error("FABRICATION FAILURE: numericScore must be null")
  console.log("✓ Non-fabrication rules passed")

  // 6. Security Review: No Browser Secrets
  console.log("6. Performing Client Environment Security Audit...")
  const envObj = (import.meta.env as Record<string, unknown>) || {}
  if (envObj.SERPAPI_API_KEY !== undefined || envObj.VITE_SERPAPI_API_KEY !== undefined) {
    throw new Error("SECURITY FAILURE: SERPAPI_API_KEY exposed in client environment!")
  }
  console.log("✓ Client Environment Security Audit passed (zero secrets in client environment)")

  console.log("\n=== ALL PHASE 5 PRODUCTION VALIDATION TESTS PASSED PROPERLY ===")
}

testPhase5Suite()
