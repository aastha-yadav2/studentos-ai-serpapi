import { useState } from "react"
import { ExternalLink, Globe, Loader2, RefreshCw, Search, ShieldAlert, Sparkles, CheckCircle2, Filter } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { StudentContextPayload } from "@/lib/opportunities/opportunityAIService"
import { discoverFreshOpportunities } from "@/lib/opportunities/serpApiOpportunityDiscovery"
import {
  evaluateDiscoveredCandidate,
  type DiscoveredOpportunityMatchResult,
} from "@/lib/opportunities/serpApiOpportunityAdapter"

interface FreshOpportunitiesSectionProps {
  studentContext: StudentContextPayload | null
}

type FilterCategory = "all" | "hackathon" | "internship" | "fellowship" | "program"

export function FreshOpportunitiesSection({ studentContext }: FreshOpportunitiesSectionProps) {
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<DiscoveredOpportunityMatchResult[] | null>(null)
  const [queriesUsed, setQueriesUsed] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<FilterCategory>("all")
  const [isCachedResult, setIsCachedResult] = useState(false)

  async function handleFindFreshOpportunities(forceFresh = false) {
    setIsSearching(true)
    setErrorMessage(null)

    try {
      const contextToUse: StudentContextPayload = studentContext ?? {
        skills: ["Python", "React", "Machine Learning"],
        careerGoals: ["Software Developer"],
      }

      // 1. Discover fresh opportunities via secure SerpApi service
      const discoveryResult = await discoverFreshOpportunities(contextToUse, { maxQueries: 2, forceFresh })

      if (!discoveryResult.success) {
        setErrorMessage(
          discoveryResult.error ||
            "Unable to fetch fresh opportunities right now. Your existing opportunities are still available."
        )
        setResults([])
        return
      }

      setQueriesUsed(discoveryResult.queriesUsed)
      setIsCachedResult(Boolean(discoveryResult.cached))

      // 2. Evaluate each candidate using existing adapter + deterministic matcher
      const evaluated = discoveryResult.candidates.map((candidate) =>
        evaluateDiscoveredCandidate(candidate, contextToUse)
      )

      setResults(evaluated)
    } catch (err: unknown) {
      console.error("Fresh opportunity discovery error:", err)
      setErrorMessage("Unable to fetch fresh opportunities right now. Your existing opportunities are still available.")
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Filter existing results IN-MEMORY (zero extra network/SerpApi requests on filter clicks)
  const displayedResults = (results ?? []).filter((res) => {
    if (selectedTypeFilter === "all") return true
    const signal = (res.candidate.inferredTypeSignal || "").toLowerCase()
    if (selectedTypeFilter === "hackathon") return signal.includes("hackathon")
    if (selectedTypeFilter === "internship") return signal.includes("internship")
    if (selectedTypeFilter === "fellowship") return signal.includes("fellowship")
    if (selectedTypeFilter === "program") {
      return signal.includes("program") || signal.includes("scholarship") || signal.includes("competition")
    }
    return true
  })

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card/80 via-card/50 to-primary/5 backdrop-blur-xl shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">Fresh Opportunities</CardTitle>
              <Badge className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold">
                Live SerpApi Web Search
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Discover new opportunities from the live web based on your skills, goals, and interests.
            </CardDescription>
          </div>

          <Button
            variant="default"
            size="sm"
            onClick={() => handleFindFreshOpportunities(false)}
            disabled={isSearching}
            className="w-full sm:w-auto font-semibold text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all flex items-center justify-center gap-2"
          >
            {isSearching ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Searching Web...
              </>
            ) : (
              <>
                <Search className="size-3.5" />
                Find Fresh Opportunities
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* LOADING STATE */}
        {isSearching && (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center animate-pulse">
            <Loader2 className="size-7 animate-spin text-primary mb-3" />
            <p className="text-sm font-semibold text-foreground">
              Searching the web for opportunities that match your profile...
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Querying live index, normalizing sources, and evaluating candidate relevance
            </p>
          </div>
        )}

        {/* ERROR STATE */}
        {!isSearching && errorMessage && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleFindFreshOpportunities(true)}
              className="text-xs h-7 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
            >
              <RefreshCw className="size-3 mr-1" /> Retry
            </Button>
          </div>
        )}

        {/* EMPTY STATE */}
        {!isSearching && !errorMessage && results !== null && results.length === 0 && (
          <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
            <Search className="size-8 text-muted-foreground/60 mb-2" />
            <p className="text-sm font-semibold text-foreground">No fresh opportunities found. Try discovering again later.</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              We checked the live web using your career interests. Your existing verified catalog opportunities remain fully available.
            </p>
          </div>
        )}

        {/* RESULTS & IN-MEMORY FILTER BAR */}
        {!isSearching && results && results.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
              {/* Context info bar */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Globe className="size-3.5 text-primary shrink-0" />
                <span className="truncate">
                  Discovered via: <strong className="text-foreground">{queriesUsed.map((q) => `"${q}"`).join(", ")}</strong>
                  {isCachedResult && <span className="ml-1 text-[10px] text-muted-foreground font-mono">(cached)</span>}
                </span>
              </div>

              {/* In-Memory Client Category Filter Buttons */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                <Filter className="size-3 text-muted-foreground mr-1 shrink-0" />
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "hackathon", label: "Hackathons" },
                    { id: "internship", label: "Internships" },
                    { id: "fellowship", label: "Fellowships" },
                    { id: "program", label: "Programs" },
                  ] as const
                ).map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedTypeFilter === cat.id ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setSelectedTypeFilter(cat.id)}
                    className="text-[11px] h-7 px-2.5 shrink-0"
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>

            {displayedResults.length === 0 ? (
              <div className="flex min-h-[100px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-4 text-center">
                <p className="text-xs text-muted-foreground">No discovered results match category '{selectedTypeFilter}'.</p>
                <Button variant="ghost" size="sm" onClick={() => setSelectedTypeFilter("all")} className="text-xs mt-1">
                  Reset Category Filter
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {displayedResults.map((res) => {
                  const cand = res.candidate
                  const snippetText = cand.snippet || "Click View Official Source to read full opportunity details on the hosting website."

                  // Find skills actually present in candidate title/snippet for authentic skill highlight
                  const studentSkills = studentContext?.skills ?? []
                  const textLower = `${cand.title} ${snippetText}`.toLowerCase()
                  const supportedMatchedSkills = studentSkills.filter(
                    (skill) => skill.trim().length > 1 && textLower.includes(skill.toLowerCase().trim())
                  )

                  return (
                    <Card
                      key={cand.id}
                      className="flex flex-col justify-between border-border/80 bg-card/70 backdrop-blur-md hover:border-primary/50 transition-all shadow-sm"
                    >
                      <CardHeader className="pb-3">
                        {/* Badges Bar */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          {/* Provenance Badge */}
                          <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/30 text-[10px] font-medium flex items-center gap-1">
                            <Globe className="size-3" />
                            Discovered via web search
                          </Badge>

                          {/* Verification State Badge */}
                          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] font-medium">
                            Pending verification
                          </Badge>

                          {/* Inferred Type Signal Badge */}
                          {cand.inferredTypeSignal && cand.inferredTypeSignal !== "Opportunity" && (
                            <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/30 text-[10px] font-medium">
                              {cand.inferredTypeSignal}
                            </Badge>
                          )}

                          {/* Relevance Label Badge */}
                          <Badge
                            className={`text-[10px] font-semibold ${
                              res.relevanceLabel === "Strong discovery match"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : res.relevanceLabel === "Possible match"
                                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                                : "bg-muted/80 text-muted-foreground border-border"
                            }`}
                          >
                            {res.relevanceLabel}
                          </Badge>
                        </div>

                        {/* Title & Domain */}
                        <CardTitle className="text-base font-bold line-clamp-2 leading-snug">
                          {cand.title}
                        </CardTitle>
                        <CardDescription className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          Source: <span className="text-foreground font-semibold">{cand.source}</span>
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-3 text-xs flex-1">
                        {/* Search Snippet */}
                        <div className="bg-muted/40 p-3 rounded-lg text-muted-foreground leading-relaxed line-clamp-3 italic">
                          "{snippetText}"
                        </div>

                        {/* Authentic Matched Skills Evidence */}
                        {supportedMatchedSkills.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                              <CheckCircle2 className="size-3 text-emerald-400" />
                              Matched Profile Evidence:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {supportedMatchedSkills.map((skill) => (
                                <Badge key={skill} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[10px]">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>

                      <div className="p-4 pt-0 mt-2 border-t border-border/40 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground italic">
                          Verify criteria on official page
                        </span>
                        <a
                          href={cand.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg shadow-sm transition-all"
                        >
                          View Official Source <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
