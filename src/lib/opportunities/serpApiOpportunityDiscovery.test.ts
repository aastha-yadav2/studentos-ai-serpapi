import {
  normalizeUrl,
  normalizeTitle,
  extractDomain,
  deduplicateCandidates,
  normalizeSerpApiResult,
  generatePersonalizedSearchQueries,
  candidateToOpportunity,
  type DiscoveredOpportunityCandidate,
} from "./serpApiOpportunityDiscovery"
import type { SerpApiSearchResult } from "../serpapi/serpapiService"

export function testSerpApiDiscoverySuite() {
  console.log("=== RUNNING SERPAPI DISCOVERY TEST SUITE ===")

  // 1. URL Normalization
  console.log("1. Testing URL Normalization...")
  const url1 = "https://WWW.Devpost.Com/hackathons/ai-challenge/?utm_source=google&utm_medium=cpc&ref=xyz#overview"
  const url2 = "http://devpost.com/hackathons/ai-challenge"
  const norm1 = normalizeUrl(url1)
  const norm2 = normalizeUrl(url2)

  if (norm1 !== "devpost.com/hackathons/ai-challenge") {
    throw new Error(`URL Normalization failed: expected 'devpost.com/hackathons/ai-challenge', got '${norm1}'`)
  }
  if (norm1 !== norm2) {
    throw new Error(`URL Normalization equivalence failed: '${norm1}' !== '${norm2}'`)
  }
  console.log("✓ URL Normalization passed (strips http/https, www, trailing slashes, tracking parameters)")

  // 2. Title & Domain Normalization
  console.log("2. Testing Title & Domain Normalization...")
  const title1 = "  Google Summer of Code 2026 - Official Site!  "
  const normTitle1 = normalizeTitle(title1)
  if (normTitle1 !== "google summer of code 2026 official site") {
    throw new Error(`Title Normalization failed: '${normTitle1}'`)
  }
  const domain1 = extractDomain("https://www.unstop.com/hackathons/sih-2026")
  if (domain1 !== "unstop.com") {
    throw new Error(`Domain extraction failed: '${domain1}'`)
  }
  console.log("✓ Title & Domain Normalization passed")

  // 3. Deduplication Behavior
  console.log("3. Testing Primary & Secondary Deduplication...")
  const rawCandidatesList: DiscoveredOpportunityCandidate[] = [
    {
      id: "1",
      title: "MLH Fellowship 2026",
      url: "https://fellowship.mlh.io/batch-1?utm_source=twitter",
      snippet: "MLH Fellowship 12 week program",
      source: "mlh.io",
      position: 1,
      searchQuery: "mlh fellowship",
      discoveredAt: new Date().toISOString(),
      provenance: "Discovered via web search",
    },
    {
      id: "2",
      title: "MLH Fellowship 2026",
      url: "http://fellowship.mlh.io/batch-1/", // Same URL after normalization
      snippet: "MLH Fellowship batch 1",
      source: "mlh.io",
      position: 2,
      searchQuery: "mlh fellowship",
      discoveredAt: new Date().toISOString(),
      provenance: "Discovered via web search",
    },
    {
      id: "3",
      title: "MLH Fellowship 2026!", // Secondary title+domain duplicate
      url: "https://fellowship.mlh.io/batch-1-alternate-link",
      snippet: "MLH Fellowship batch 1 alternate link",
      source: "mlh.io",
      position: 3,
      searchQuery: "mlh fellowship",
      discoveredAt: new Date().toISOString(),
      provenance: "Discovered via web search",
    },
    {
      id: "4",
      title: "Smart India Hackathon 2026",
      url: "https://sih.gov.in",
      snippet: "Pan-India college hackathon",
      source: "sih.gov.in",
      position: 4,
      searchQuery: "sih hackathon",
      discoveredAt: new Date().toISOString(),
      provenance: "Discovered via web search",
    },
  ]

  const deduplicated = deduplicateCandidates(rawCandidatesList)
  if (deduplicated.length !== 2) {
    throw new Error(`Deduplication failed: expected 2 unique candidates, got ${deduplicated.length}`)
  }
  if (deduplicated[0].title !== "MLH Fellowship 2026" || deduplicated[1].title !== "Smart India Hackathon 2026") {
    throw new Error("Deduplication returned incorrect candidates")
  }
  console.log("✓ Primary (URL) and Secondary (Title+Domain) Deduplication passed")

  // 4. Result Normalization & Malformed Handling
  console.log("4. Testing Result Normalization & Malformed Input Handling...")
  const validRaw: SerpApiSearchResult = {
    title: "ETHGlobal Hackathons 2026",
    link: "https://ethglobal.com/events",
    snippet: "Build Web3 decentralized apps.",
    position: 1,
    displayed_link: "ethglobal.com/events",
  }
  const normCand = normalizeSerpApiResult(validRaw, "ethglobal hackathons")
  if (!normCand || normCand.title !== "ETHGlobal Hackathons 2026" || normCand.source !== "ethglobal.com") {
    throw new Error("Valid raw result normalization failed")
  }
  if (normCand.provenance !== "Discovered via web search") {
    throw new Error("Provenance tag missing or invalid")
  }

  // Malformed test 1: missing link
  const malformed1: SerpApiSearchResult = { title: "No Link Result", snippet: "snippet" }
  if (normalizeSerpApiResult(malformed1, "query") !== null) {
    throw new Error("Malformed result with missing link should return null")
  }

  // Malformed test 2: missing title
  const malformed2: SerpApiSearchResult = { link: "https://example.com" }
  if (normalizeSerpApiResult(malformed2, "query") !== null) {
    throw new Error("Malformed result with missing title should return null")
  }
  console.log("✓ Result Normalization and Malformed Input Handling passed")

  // 5. Query Strategy Generation
  console.log("5. Testing Personalized Search Query Strategy Generation...")
  const studentContext = {
    skills: ["Python", "React", "Machine Learning"],
    careerGoals: ["AI Researcher"],
    internshipInterests: ["ML Internship"],
    hackathonInterests: ["Generative AI Hackathon"],
  }

  const queries = generatePersonalizedSearchQueries(studentContext, { maxQueries: 2 })
  if (queries.length > 2) {
    throw new Error(`Query strategy generated more queries (${queries.length}) than maxQueries (2) limit`)
  }
  if (!queries.some((q) => q.includes("Python") || q.includes("Generative AI"))) {
    throw new Error(`Generated queries did not incorporate student context: ${JSON.stringify(queries)}`)
  }

  // Test sparse context fallback
  const sparseQueries = generatePersonalizedSearchQueries({}, { maxQueries: 2 })
  if (sparseQueries.length === 0 || !sparseQueries[0].includes("students")) {
    throw new Error("Sparse context fallback failed to produce standard student queries")
  }
  console.log("✓ Personalized Search Query Strategy Generation passed (queries strictly bounded)")

  // 6. Candidate to Opportunity Safety Rules
  console.log("6. Testing Candidate to Opportunity Safety / Provenance Conversion...")
  const opp = candidateToOpportunity(normCand)
  if (opp.verification_state !== "pending") {
    throw new Error(`Opportunity verification_state must be 'pending', got '${opp.verification_state}'`)
  }
  if (opp.required_skills.length > 0 || opp.deadline !== null || opp.stipend_prize !== null) {
    throw new Error("Safety violation: candidateToOpportunity invented non-existent facts!")
  }
  console.log("✓ Safety conversion rules passed (zero invented facts, pending verification state)")

  console.log("\n=== ALL SERPAPI DISCOVERY TESTS PASSED SUCCESSFULLY ===")
}

testSerpApiDiscoverySuite()
