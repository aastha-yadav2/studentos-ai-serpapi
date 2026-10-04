import { verifySerpApiSecret, searchSerpApi } from "./serpapiService"

export function testSerpApiArchitecture() {
  console.log("=== RUNNING SERPAPI ARCHITECTURE SECURITY SUITE ===")

  // 1. Enforce that VITE_SERPAPI_API_KEY is NOT set in client env
  const envKey = (import.meta.env as Record<string, unknown>)?.VITE_SERPAPI_API_KEY
  if (envKey !== undefined) {
    throw new Error("SECURITY FAILURE: VITE_SERPAPI_API_KEY found in client environment variables!")
  }
  console.log("✓ Test 1 Passed: Zero client-side VITE_SERPAPI_API_KEY environment variable")

  // 2. Exported methods exist and are functions
  if (typeof verifySerpApiSecret !== "function" || typeof searchSerpApi !== "function") {
    throw new Error("Test 2 Failed: Exported SerpApi helper functions missing")
  }
  console.log("✓ Test 2 Passed: SerpApi server invocation functions properly defined")

  console.log("\n=== ALL SERPAPI ARCHITECTURE TESTS PASSED ===")
}

testSerpApiArchitecture()
