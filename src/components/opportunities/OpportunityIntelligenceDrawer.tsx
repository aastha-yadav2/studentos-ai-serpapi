import { useEffect, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Opportunity } from "@/lib/opportunities/opportunityTypes"
import type { StudentContextPayload } from "@/lib/opportunities/opportunityAIService"
import type { SanityOpportunityKnowledge } from "@/lib/sanity/sanityTypes"
import {
  askOpportunityFollowUp,
  type OpportunityIntelligenceResult,
} from "@/lib/opportunities/opportunityIntelligenceService"

interface OpportunityIntelligenceDrawerProps {
  isOpen: boolean
  onClose: () => void
  opportunity: Opportunity
  studentContext: StudentContextPayload
  sanityKnowledge: SanityOpportunityKnowledge | null
  intelligence: OpportunityIntelligenceResult
  session: Session | null
}

export function OpportunityIntelligenceDrawer({
  isOpen,
  onClose,
  opportunity,
  studentContext,
  sanityKnowledge,
  intelligence,
  session,
}: OpportunityIntelligenceDrawerProps) {
  const [qaInput, setQaInput] = useState("")
  const [isQaLoading, setIsQaLoading] = useState(false)
  const [qaHistory, setQaHistory] = useState<Array<{ question: string; answer: string; suggestedActions?: string[] }>>([])

  // Reset QA history whenever selected opportunity changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQaHistory([])
      setQaInput("")
    }, 0)
    return () => window.clearTimeout(timer)
  }, [opportunity?.id])

  if (!isOpen) return null

  const isNotEligible = intelligence.eligibility.status === "not_eligible"
  const isEligible = intelligence.eligibility.status === "eligible"

  async function handleAskQuestion(queryText?: string) {
    const q = (queryText || qaInput).trim()
    if (!q || isQaLoading) return

    setIsQaLoading(true)
    setQaInput("")
    try {
      const res = await askOpportunityFollowUp({
        session,
        opportunity,
        studentContext,
        sanityKnowledge,
        intelligenceResult: intelligence,
        question: q,
      })

      setQaHistory((prev) => [
        ...prev,
        { question: q, answer: res.answer, suggestedActions: res.suggestedActions },
      ])
    } catch (err) {
      console.error("QA error:", err)
    } finally {
      setIsQaLoading(false)
    }
  }

  const suggestedQuestions = [
    "Am I actually ready for this opportunity?",
    "What documents do I need?",
    "What skills am I missing?",
    "How can I prepare over the next 2 weeks?",
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full border-l border-border bg-card p-6 shadow-2xl space-y-6 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/80">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-primary/10 text-primary border-primary/30 flex items-center gap-1 font-semibold text-xs">
                <Sparkles className="size-3 text-primary" /> Opportunity Intelligence Agent
              </Badge>
              {intelligence.isFallbackKnowledge ? (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] flex items-center gap-1">
                  <Database className="size-3" /> Sanity Demo Fallback
                </Badge>
              ) : (
                <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] flex items-center gap-1">
                  <ShieldCheck className="size-3" /> Verified Sanity Knowledge Graph
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight mt-2">{opportunity.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {opportunity.organization} • {opportunity.type} • {opportunity.location}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="size-8 p-0 rounded-full">
            <X className="size-4" />
          </Button>
        </div>

        {/* Readiness Verdict Banner */}
        <div
          className={`rounded-2xl border p-4 space-y-2 ${
            isNotEligible
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : isEligible
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {isNotEligible ? (
              <AlertCircle className="size-5 text-red-400 shrink-0" />
            ) : isEligible ? (
              <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
            ) : (
              <Zap className="size-5 text-amber-400 shrink-0" />
            )}
            <h3 className="font-bold text-sm text-foreground">Readiness Assessment</h3>
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed font-medium">{intelligence.verdict}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
            {intelligence.explanation}
          </p>
        </div>

        {/* Eligibility Verification Checklist */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" /> Mandatory Eligibility Facts
          </h4>

          {intelligence.eligibility.blockers.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-1.5 text-xs text-red-300">
              <span className="font-bold text-red-400 flex items-center gap-1">
                <AlertCircle className="size-3.5" /> Eligibility Blockers:
              </span>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                {intelligence.eligibility.blockers.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {intelligence.eligibility.satisfied.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5 text-xs text-emerald-300">
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Satisfied Criteria:
              </span>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                {intelligence.eligibility.satisfied.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Skill Match & Gap Breakdown */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-1.5">
            <Zap className="size-4 text-amber-400" /> Skill Fit & Gap Analysis
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2">
              <span className="font-semibold text-emerald-400 flex items-center gap-1 text-[11px]">
                <CheckCircle2 className="size-3.5" /> Matched Skills ({intelligence.skillMatch.matched.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {intelligence.skillMatch.matched.length > 0 ? (
                  intelligence.skillMatch.matched.map((s) => (
                    <Badge key={s} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[10px]">
                      {s}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-[11px]">No direct skills matched yet</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2">
              <span className="font-semibold text-amber-400 flex items-center gap-1 text-[11px]">
                <AlertCircle className="size-3.5" /> Missing Skills ({intelligence.skillMatch.gaps.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {intelligence.skillMatch.gaps.length > 0 ? (
                  intelligence.skillMatch.gaps.map((s) => (
                    <Badge key={s} className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-[10px]">
                      + {s}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-[11px]">All required skills satisfied!</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Application Process & Document Requirements */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-1.5">
            <FileText className="size-4 text-cyan-400" /> Application Workflow & Documents (Sanity)
          </h4>
          <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3 text-xs">
            <div>
              <p className="font-semibold text-foreground mb-1.5">Sequential Application Steps:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-[11px]">
                {intelligence.applicationPlan.steps.map((step, idx) => (
                  <li key={idx} className="leading-relaxed">
                    <span className="text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {intelligence.applicationPlan.documents.length > 0 && (
              <div className="pt-2 border-t border-border/60">
                <p className="font-semibold text-foreground mb-1.5">Required Documents Checklist:</p>
                <div className="flex flex-wrap gap-1.5">
                  {intelligence.applicationPlan.documents.map((doc, idx) => (
                    <Badge key={idx} className="bg-cyan-500/10 text-cyan-300 border-cyan-500/30 text-[10px]">
                      📄 {doc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Curated Sanity Resources */}
        {intelligence.resources.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              <BookOpen className="size-4 text-purple-400" /> Curated Resources & Guides (Sanity Graph)
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {intelligence.resources.map((res, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/40 p-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">{res.title}</p>
                    {res.type && <span className="text-[10px] text-muted-foreground capitalize">• {res.type}</span>}
                  </div>
                  {res.url && (
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 shrink-0 ml-2"
                    >
                      Open <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Ask StudentOS Assistant */}
        <div className="space-y-3 pt-4 border-t border-border/80">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              <HelpCircle className="size-4 text-primary" /> Ask StudentOS About This Opportunity
            </h4>
            <span className="text-[10px] text-muted-foreground">Grounded Q&A Agent</span>
          </div>

          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-1.5">
            {suggestedQuestions.map((q, idx) => (
              <Button
                key={idx}
                variant="secondary"
                size="sm"
                onClick={() => handleAskQuestion(q)}
                disabled={isQaLoading}
                className="text-[11px] h-7 px-2.5 font-normal border-border/80 hover:border-primary/50 text-muted-foreground hover:text-foreground"
              >
                {q}
              </Button>
            ))}
          </div>

          {/* Q&A Conversation Feed */}
          {qaHistory.length > 0 && (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {qaHistory.map((item, idx) => (
                <div key={idx} className="space-y-1.5 text-xs rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p className="font-semibold text-primary flex items-center gap-1">
                    <ArrowRight className="size-3" /> Q: {item.question}
                  </p>
                  <p className="text-foreground/90 text-[11px] leading-relaxed pl-4">{item.answer}</p>
                  {item.suggestedActions && item.suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 pl-4">
                      {item.suggestedActions.map((act, aIdx) => (
                        <Badge key={aIdx} className="bg-primary/10 text-primary border-primary/20 text-[9px]">
                          Action: {act}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Input Box */}
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={qaInput}
              onChange={(e) => setQaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAskQuestion()
              }}
              placeholder="Ask a question about eligibility, required skills, or prep advice..."
              disabled={isQaLoading}
              className="text-xs"
            />
            <Button
              size="sm"
              onClick={() => handleAskQuestion()}
              disabled={isQaLoading || !qaInput.trim()}
              className="shrink-0 text-xs"
            >
              {isQaLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
