import type { Session } from "@supabase/supabase-js"
import { supabaseUrl } from "../supabase"

export type AIRequestType = "planner" | "resume_review" | "personalized_study_plan" | "career_advice" | "goal_recommendations" | "reflection_analysis" | "reflection_coaching" | "task_assistance" | "interview_preparation" | "essay_improvement" | "communication_draft" | "opportunity_match" | "opportunity_prep_plan" | "opportunity_intelligence" | "opportunity_qa"
export type AIResult<T> = { data: T; source: "groq" | "cache"; fallback: false; trace?: string[] }

/** The sole browser-to-AI boundary. Router/Groq failures are deliberately surfaced to the UI. */
export async function requestAI<T>(session: Session | null, requestType: AIRequestType, payload: unknown): Promise<AIResult<T>> {
  if (!session || !supabaseUrl) throw new Error("AI is unavailable: an authenticated Supabase session and VITE_SUPABASE_URL are required.")
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-router`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ requestType, payload }) })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) throw new Error(body?.error ?? `AI Router request failed with HTTP ${response.status}.`)
  return { data: body as T, source: body.source, fallback: false, trace: body.trace }
}
