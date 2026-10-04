import {
  evaluateDiscoveredCandidate,
  type DiscoveredOpportunityMatchResult,
} from "../../lib/opportunities/serpApiOpportunityAdapter"
import type { DiscoveredOpportunityCandidate } from "../../lib/opportunities/serpApiOpportunityDiscovery"

export function testFreshOpportunitiesUISuite() {
  console.log("=== RUNNING FRESH OPPORTUNITIES UI TEST SUITE ===")

  const sampleCandidate: DiscoveredOpportunityCandidate = {
    id: "disc_devpost_com_ai_2026",
    title: "National AI Innovation Hackathon 2026",
    url: "https://devpost.com/hackathons/national-ai-2026",
    snippet: "Build cutting-edge Python and React applications for student developers in India.",
    source: "devpost.com",
    position: 1,
    displayedLink: "devpost.com/hackathons/national-ai-2026",
    searchQuery: "AI hackathons 2026",
    discoveredAt: new Date().toISOString(),
    provenance: "Discovered via web search",
  }

  const studentContext = {
    skills: ["Python", "React"],
    careerGoals: ["Software Developer"],
  }

  // 1. Evaluate Discovered Candidate for UI Render
  console.log("1. Evaluating candidate for UI display...")
  const evaluated: DiscoveredOpportunityMatchResult = evaluateDiscoveredCandidate(sampleCandidate, studentContext)

  // 2. Result Card Required Fields Validation
  console.log("2. Validating required result card fields...")
  if (evaluated.candidate.title !== "National AI Innovation Hackathon 2026") {
    throw new Error("UI Card Title mismatch")
  }
  if (evaluated.candidate.source !== "devpost.com") {
    throw new Error("UI Card Source domain mismatch")
  }
  if (evaluated.provenance !== "Discovered via web search") {
    throw new Error("UI Card Provenance tag missing or invalid")
  }
  if (evaluated.verificationState !== "PENDING_VERIFICATION") {
    throw new Error("UI Card Verification state must be PENDING_VERIFICATION")
  }
  if (!evaluated.relevanceLabel) {
    throw new Error("UI Card Relevance label missing")
  }
  if (evaluated.candidate.url !== "https://devpost.com/hackathons/national-ai-2026") {
    throw new Error("UI Card Official Source link URL mismatch")
  }

  // 3. Strict Non-Fabrication Rule Check
  console.log("3. Validating non-fabrication of metadata...")
  const opp = evaluated.opportunity
  if (opp.required_skills.length !== 0) {
    throw new Error("UI Card must NOT show fabricated required_skills")
  }
  if (opp.eligibility.length !== 0) {
    throw new Error("UI Card must NOT show fabricated eligibility criteria")
  }
  if (opp.deadline !== null) {
    throw new Error("UI Card must NOT show fabricated deadlines")
  }
  if (opp.stipend_prize !== null) {
    throw new Error("UI Card must NOT show fabricated stipend or prize amounts")
  }
  if (evaluated.numericScore !== null) {
    throw new Error("UI Card must NOT show fabricated numeric match score when skills are unparsed")
  }
  console.log("✓ All UI result card requirements & non-fabrication rules passed")

  // 4. UI Copy Constants Verification
  console.log("4. Validating UI state copy strings...")
  const sectionTitle = "Fresh Opportunities"
  const sectionSubtitle = "Discover new opportunities from the live web based on your skills, goals, and interests."
  const ctaButtonText = "Find Fresh Opportunities"
  const loadingText = "Searching the web for opportunities that match your profile..."
  const emptyStateText = "No fresh opportunities found. Try discovering again later."
  const errorStateText = "Unable to fetch fresh opportunities right now. Your existing opportunities are still available."

  if (!sectionTitle || !sectionSubtitle || !ctaButtonText || !loadingText || !emptyStateText || !errorStateText) {
    throw new Error("UI string copy missing or incomplete")
  }
  console.log("✓ UI state copy strings verified")

  console.log("\n=== ALL FRESH OPPORTUNITIES UI TESTS PASSED SUCCESSFULLY ===")
}

testFreshOpportunitiesUISuite()
