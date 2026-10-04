import {
  candidateToOpportunityAdapter,
  evaluateDiscoveredCandidate,
  generateDiscoveredOpportunityAIExplanation,
} from "./serpApiOpportunityAdapter"
import type { DiscoveredOpportunityCandidate } from "./serpApiOpportunityDiscovery"

export async function testSerpApiAdapterSuite() {
  console.log("=== RUNNING SERPAPI ADAPTER & INTELLIGENCE SUITE ===")

  const validCandidate: DiscoveredOpportunityCandidate = {
    id: "disc_devpost_com_hackathons_ai_2026",
    title: "Global AI & Autonomous Agents Hackathon 2026",
    url: "https://devpost.com/hackathons/ai-2026",
    snippet: "Build open source autonomous AI agents with Python, React, and LLMs.",
    source: "devpost.com",
    position: 1,
    displayedLink: "devpost.com/hackathons/ai-2026",
    searchQuery: "AI hackathons 2026",
    discoveredAt: "2026-10-04T12:00:00.000Z",
    provenance: "Discovered via web search",
  }

  // 1. Candidate -> Opportunity Adapter (No Fabrication)
  console.log("1. Testing Candidate to Opportunity Adapter...")
  const opp = candidateToOpportunityAdapter(validCandidate)

  if (opp.id !== validCandidate.id || opp.title !== validCandidate.title) {
    throw new Error("Adapter failed to map basic metadata")
  }
  if (opp.source_url !== validCandidate.url || opp.source_platform !== validCandidate.source) {
    throw new Error("Adapter failed to preserve source URL or platform domain")
  }
  if (opp.eligibility.length !== 0) {
    throw new Error(`FABRICATION FAILURE: eligibility must be empty [], got ${JSON.stringify(opp.eligibility)}`)
  }
  if (opp.required_skills.length !== 0) {
    throw new Error(`FABRICATION FAILURE: required_skills must be empty [], got ${JSON.stringify(opp.required_skills)}`)
  }
  if (opp.deadline !== null || opp.stipend_prize !== null) {
    throw new Error("FABRICATION FAILURE: deadline and stipend_prize must be null")
  }
  if (opp.verification_state !== "pending") {
    throw new Error(`Adapter must set verification_state to 'pending', got '${opp.verification_state}'`)
  }
  console.log("✓ Candidate -> Opportunity Adapter passed (zero fabricated fields)")

  // 2. Malformed Candidate Handling
  console.log("2. Testing Malformed Candidate Handling...")
  const malformed1 = { ...validCandidate, url: "" }
  let caught1 = false
  try {
    candidateToOpportunityAdapter(malformed1)
  } catch {
    caught1 = true
  }
  if (!caught1) throw new Error("Adapter failed to reject malformed candidate with missing URL")

  const malformed2 = { ...validCandidate, title: "" }
  let caught2 = false
  try {
    candidateToOpportunityAdapter(malformed2)
  } catch {
    caught2 = true
  }
  if (!caught2) throw new Error("Adapter failed to reject malformed candidate with missing Title")
  console.log("✓ Malformed Candidate Handling passed")

  // 3. Integration with Existing Deterministic Matcher
  console.log("3. Testing Matcher Integration & Qualitative Ranking...")
  const studentContext = {
    skills: ["Python", "React", "Machine Learning"],
    careerGoals: ["AI Researcher"],
    hackathonInterests: ["AI Hackathon"],
  }

  const matchResult = evaluateDiscoveredCandidate(validCandidate, studentContext)

  if (!matchResult.deterministicMatch) {
    throw new Error("Match result missing deterministicMatch output")
  }
  if (matchResult.hasStructuredSkills !== false) {
    throw new Error("hasStructuredSkills must be false for discovered candidates with no structured skills")
  }
  if (matchResult.numericScore !== null) {
    throw new Error(`numericScore must be null when structured skills are missing, got ${matchResult.numericScore}`)
  }
  if (matchResult.relevanceLabel !== "Strong discovery match") {
    throw new Error(`Expected 'Strong discovery match', got '${matchResult.relevanceLabel}'`)
  }
  if (matchResult.discoveryState !== "DISCOVERED" || matchResult.verificationState !== "PENDING_VERIFICATION") {
    throw new Error("Invalid discovery or verification state")
  }
  if (matchResult.provenance !== "Discovered via web search") {
    throw new Error("Provenance must be 'Discovered via web search'")
  }
  if (!matchResult.explanation.includes("Insufficient structured data for deterministic skill match")) {
    throw new Error("Explanation must clearly state missing structured skill data")
  }
  console.log("✓ Matcher Integration & Qualitative Ranking passed")

  // 4. AI Explanation Safety & Disclaimer
  console.log("4. Testing AI Explanation Safety & Disclaimer...")
  const aiResult = await generateDiscoveredOpportunityAIExplanation(validCandidate, studentContext, null)

  if (!aiResult.disclaimer || !aiResult.disclaimer.includes("Verify details on official opportunity page")) {
    throw new Error("AI explanation missing required disclaimer")
  }
  if (!aiResult.explanation.includes(aiResult.disclaimer)) {
    throw new Error("AI explanation text must include disclaimer statement")
  }
  if (!Array.isArray(aiResult.suggestedVerificationSteps) || aiResult.suggestedVerificationSteps.length === 0) {
    throw new Error("AI result missing suggested verification steps")
  }
  console.log("✓ AI Explanation Safety & Disclaimer passed")

  console.log("\n=== ALL SERPAPI ADAPTER & INTELLIGENCE TESTS PASSED ===")
}

testSerpApiAdapterSuite()
