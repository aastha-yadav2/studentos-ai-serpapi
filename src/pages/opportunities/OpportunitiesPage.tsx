import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  ArrowUpDown,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  Filter,
  Info,
  Layers,
  Loader2,
  PlusCircle,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react"
import { useAuth } from "@/auth/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { profileService } from "@/lib/memory/profileService"
import {
  createTaskFromOpportunityMilestone,
  fetchOpportunities,
  fetchUserApplications,
  fetchUserOpportunityMatches,
  fetchUserPrepPlans,
  fetchUserSavedOpportunities,
  fetchUserTaskTitles,
  fetchOpportunityChangeEvents,
  toggleSaveOpportunity,
  updateApplicationStatus,
} from "@/lib/opportunities/opportunityService"
import {
  computeOpportunityMatch,
  generateOpportunityPrepPlan,
  type ComprehensiveMatchResult,
  type StudentContextPayload,
} from "@/lib/opportunities/opportunityAIService"
import {
  calculateDeterministicMatch,
  isMatchStale,
  isPrepPlanStale,
} from "@/lib/opportunities/deterministicMatcher"
import { buildOpportunityRadar } from "@/lib/opportunities/radar/radarService"
import { RadarWidget } from "@/components/radar/RadarWidget"
import { OpportunityIntelligenceDrawer } from "@/components/opportunities/OpportunityIntelligenceDrawer"
import { FreshOpportunitiesSection } from "@/components/opportunities/FreshOpportunitiesSection"
import {
  generateOpportunityIntelligence,
  type OpportunityIntelligenceResult,
} from "@/lib/opportunities/opportunityIntelligenceService"
import { getSanityOpportunityKnowledge } from "@/lib/sanity/sanityOpportunityService"
import type { SanityOpportunityKnowledge } from "@/lib/sanity/sanityTypes"
import type { RadarResult } from "@/lib/opportunities/radar/types"
import type {
  ApplicationStatus,
  Opportunity,
  OpportunityPrepPlanData,
  OpportunityType,
} from "@/lib/opportunities/opportunityTypes"

type TabType = "catalog" | "radar" | "saved" | "applications" | "prep"
type SortOption = "match_desc" | "title_asc" | "verified_first" | "newest"

const ALL_APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "interested", label: "Interested" },
  { value: "applying", label: "Preparing Application" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "accepted", label: "Accepted 🎉" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "deadline_passed", label: "Deadline Passed" },
]

function formatApplicationWindow(opp: Opportunity): string {
  if (opp.status === "expired" || opp.status === "archived") {
    return "Closed"
  }
  if (opp.deadline) {
    const d = new Date(opp.deadline)
    if (d.getTime() < Date.now()) return "Closed"
    return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  }
  if (opp.application_open_date) {
    const openDate = new Date(opp.application_open_date)
    if (openDate.getTime() > Date.now()) {
      return `Opens ${openDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    }
  }
  if (opp.type === "ambassador") {
    return "Rolling Applications"
  }
  return "No Deadline Published"
}

export function OpportunitiesPage() {
  const { user, session } = useAuth()
  const [searchParams] = useSearchParams()
  const targetOppId = searchParams.get("id")
  const requestedTab = searchParams.get("tab")

  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [applications, setApplications] = useState<Map<string, ApplicationStatus>>(new Map())
  const [matches, setMatches] = useState<Map<string, ComprehensiveMatchResult>>(new Map())
  const [prepPlans, setPrepPlans] = useState<Map<string, OpportunityPrepPlanData>>(new Map())
  const [radarResult, setRadarResult] = useState<RadarResult | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<TabType>(requestedTab === "radar" ? "radar" : "catalog")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<OpportunityType | "all">("all")
  const [sortOption, setSortOption] = useState<SortOption>("match_desc")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Detail & Drawer Modals
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<{ opportunity: Opportunity; match: ComprehensiveMatchResult } | null>(null)
  const [selectedPrepPlan, setSelectedPrepPlan] = useState<{ opportunity: Opportunity; plan: OpportunityPrepPlanData } | null>(null)
  const [selectedIntelligenceOpp, setSelectedIntelligenceOpp] = useState<Opportunity | null>(null)
  const [selectedSanityKnowledge, setSelectedSanityKnowledge] = useState<SanityOpportunityKnowledge | null>(null)
  const [selectedIntelligenceResult, setSelectedIntelligenceResult] = useState<OpportunityIntelligenceResult | null>(null)
  const [intelligenceStudentContext, setIntelligenceStudentContext] = useState<StudentContextPayload | null>(null)
  const [studentContextPayload, setStudentContextPayload] = useState<StudentContextPayload | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Loading & Feedback states
  const [matchingId, setMatchingId] = useState<string | null>(null)
  const [prepId, setPrepId] = useState<string | null>(null)
  const [intelligenceLoadingId, setIntelligenceLoadingId] = useState<string | null>(null)
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set())

  // Handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedOpportunity(null)
        setSelectedMatch(null)
        setSelectedPrepPlan(null)
        setIsDrawerOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      if (!user?.id) return
      setIsLoading(true)
      setErrorMsg(null)
      try {
        const [opps, savedList, appsList, matchList, planList, existingTaskTitles, changeEvents, profile] = await Promise.all([
          fetchOpportunities(),
          fetchUserSavedOpportunities(user.id),
          fetchUserApplications(user.id),
          fetchUserOpportunityMatches(user.id),
          fetchUserPrepPlans(user.id),
          fetchUserTaskTitles(user.id),
          fetchOpportunityChangeEvents(),
          profileService.get(user.id),
        ])

        if (!isMounted) return

        setOpportunities(opps)
        const savedSet = new Set(savedList.map((s) => s.opportunity_id))
        setSavedIds(savedSet)
        setAddedTasks(existingTaskTitles)

        if (targetOppId) {
          const targetOpp = opps.find((o) => o.id === targetOppId)
          if (targetOpp) {
            setSelectedOpportunity(targetOpp)
          }
        }

        const appMap = new Map<string, ApplicationStatus>()
        appsList.forEach((a) => appMap.set(a.opportunity_id, a.status))
        setApplications(appMap)

        const studentContext = {
          skills: profile?.skills ?? [],
          careerGoals: profile?.placement_goals ?? [],
          semester: profile?.semester ?? "Semester 6",
          internshipInterests: profile?.internship_goals ?? [],
          hackathonInterests: profile?.hackathon_interests ?? [],
        }
        setStudentContextPayload(studentContext)

        // Cache Invalidation & Deterministic Match pre-computation for ALL catalog opportunities
        const matchMap = new Map<string, ComprehensiveMatchResult>()
        matchList.forEach((m) => {
          const opp = opps.find((o) => o.id === m.opportunity_id)
          if (opp && !isMatchStale(m, studentContext, opp)) {
            const deterministic = calculateDeterministicMatch(studentContext, opp)
            matchMap.set(m.opportunity_id, {
              ...m,
              eligibility_status: deterministic.eligibility_status,
              eligibility_notes: deterministic.eligibility_notes,
              eligibility_location_score: deterministic.eligibility_location_score,
            })
          }
        })

        // Precompute deterministic fit score for remaining catalog items
        opps.forEach((opp) => {
          if (!matchMap.has(opp.id)) {
            const deterministic = calculateDeterministicMatch(studentContext, opp)
            matchMap.set(opp.id, {
              id: `deterministic-${opp.id}`,
              user_id: user.id,
              opportunity_id: opp.id,
              match_score: deterministic.match_score,
              skill_match_score: deterministic.skill_match_score,
              goal_match_score: deterministic.goal_match_score,
              eligibility_location_score: deterministic.eligibility_location_score,
              eligibility_status: deterministic.eligibility_status,
              eligibility_notes: deterministic.eligibility_notes,
              explanation: deterministic.explanation,
              strengths: deterministic.strengths,
              missing_skills: deterministic.missing_skills,
              gaps: deterministic.gaps,
              recommended_actions: deterministic.recommended_actions,
              computed_at: new Date().toISOString(),
            })
          }
        })

        setMatches(matchMap)

        // Cache Invalidation Check: filter out stale prep plans if student profile context has changed
        const planMap = new Map<string, OpportunityPrepPlanData>()
        planList.forEach((p) => {
          if (!isPrepPlanStale(p.plan, studentContext)) {
            planMap.set(p.opportunity_id, p.plan)
          }
        })
        setPrepPlans(planMap)

        // Build Opportunity Radar for Opportunities page embedded Radar view
        const radar = buildOpportunityRadar({
          studentContext,
          opportunities: opps,
          savedOpportunityIds: savedSet,
          applications: appMap,
          matches: matchMap,
          prepPlans: planMap,
          changeEvents,
        })
        setRadarResult(radar)
      } catch (err) {
        console.error("Failed loading opportunity data:", err)
        if (isMounted) {
          setErrorMsg("Could not load opportunities. Please check your network connection and try again.")
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadData()
    return () => {
      isMounted = false
    }
  }, [user?.id, targetOppId])

  async function handleRefresh() {
    if (!user?.id) return
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const [opps, savedList, appsList, matchList, planList, existingTaskTitles, profile] = await Promise.all([
        fetchOpportunities(),
        fetchUserSavedOpportunities(user.id),
        fetchUserApplications(user.id),
        fetchUserOpportunityMatches(user.id),
        fetchUserPrepPlans(user.id),
        fetchUserTaskTitles(user.id),
        profileService.get(user.id),
      ])

      setOpportunities(opps)
      setSavedIds(new Set(savedList.map((s) => s.opportunity_id)))
      setAddedTasks(existingTaskTitles)

      const appMap = new Map<string, ApplicationStatus>()
      appsList.forEach((a) => appMap.set(a.opportunity_id, a.status))
      setApplications(appMap)

      const studentContext = {
        skills: profile?.skills ?? [],
        careerGoals: profile?.placement_goals ?? [],
        semester: profile?.semester ?? "Semester 6",
        internshipInterests: profile?.internship_goals ?? [],
        hackathonInterests: profile?.hackathon_interests ?? [],
      }
      setStudentContextPayload(studentContext)

      const matchMap = new Map<string, ComprehensiveMatchResult>()
      matchList.forEach((m) => {
        const opp = opps.find((o) => o.id === m.opportunity_id)
        if (opp && !isMatchStale(m, studentContext, opp)) {
          const deterministic = calculateDeterministicMatch(studentContext, opp)
          matchMap.set(m.opportunity_id, {
            ...m,
            eligibility_status: deterministic.eligibility_status,
            eligibility_notes: deterministic.eligibility_notes,
            eligibility_location_score: deterministic.eligibility_location_score,
          })
        }
      })

      opps.forEach((opp) => {
        if (!matchMap.has(opp.id)) {
          const deterministic = calculateDeterministicMatch(studentContext, opp)
          matchMap.set(opp.id, {
            id: `deterministic-${opp.id}`,
            user_id: user.id,
            opportunity_id: opp.id,
            match_score: deterministic.match_score,
            skill_match_score: deterministic.skill_match_score,
            goal_match_score: deterministic.goal_match_score,
            eligibility_location_score: deterministic.eligibility_location_score,
            eligibility_status: deterministic.eligibility_status,
            eligibility_notes: deterministic.eligibility_notes,
            explanation: deterministic.explanation,
            strengths: deterministic.strengths,
            missing_skills: deterministic.missing_skills,
            gaps: deterministic.gaps,
            recommended_actions: deterministic.recommended_actions,
            computed_at: new Date().toISOString(),
          })
        }
      })

      setMatches(matchMap)

      const planMap = new Map<string, OpportunityPrepPlanData>()
      planList.forEach((p) => {
        if (!isPrepPlanStale(p.plan, studentContext)) {
          planMap.set(p.opportunity_id, p.plan)
        }
      })
      setPrepPlans(planMap)
    } catch (err) {
      console.error("Failed loading opportunity data:", err)
      setErrorMsg("Could not load opportunities. Please check your network connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleToggleSave(oppId: string) {
    if (!user?.id) return
    const isCurrentlySaved = savedIds.has(oppId)
    const success = await toggleSaveOpportunity(user.id, oppId, isCurrentlySaved)
    if (success) {
      setSavedIds((prev) => {
        const next = new Set(prev)
        if (isCurrentlySaved) next.delete(oppId)
        else next.add(oppId)
        return next
      })
    }
  }

  async function handleStatusChange(oppId: string, status: ApplicationStatus) {
    if (!user?.id) return
    const updated = await updateApplicationStatus(user.id, oppId, status)
    if (updated) {
      setApplications((prev) => new Map(prev).set(oppId, status))
    }
  }

  async function handleRunMatch(opportunity: Opportunity) {
    if (!user?.id) return

    setMatchingId(opportunity.id)
    setErrorMsg(null)
    try {
      const profile = await profileService.get(user.id)
      const studentContext = {
        skills: profile?.skills ?? [],
        careerGoals: profile?.placement_goals ?? [],
        semester: profile?.semester ?? "Semester 6",
        internshipInterests: profile?.internship_goals ?? [],
        hackathonInterests: profile?.hackathon_interests ?? [],
      }

      // Check if existing match is current
      const existingMatch = matches.get(opportunity.id)
      if (existingMatch && !isMatchStale(existingMatch, studentContext, opportunity)) {
        setSelectedMatch({ opportunity, match: existingMatch })
        return
      }

      const computed = await computeOpportunityMatch(session, user.id, opportunity, studentContext)
      if (computed) {
        setMatches((prev) => new Map(prev).set(opportunity.id, computed))
        setSelectedMatch({ opportunity, match: computed })
      }
    } catch (err) {
      console.error("Match computation error:", err)
      setErrorMsg("Failed to generate match insights. Please try again.")
    } finally {
      setMatchingId(null)
    }
  }

  async function handleRunPrepPlan(opportunity: Opportunity) {
    if (!user?.id) return

    setPrepId(opportunity.id)
    setErrorMsg(null)
    try {
      const profile = await profileService.get(user.id)
      const studentContext = {
        skills: profile?.skills ?? [],
        careerGoals: profile?.placement_goals ?? [],
        semester: profile?.semester ?? "Semester 6",
        internshipInterests: profile?.internship_goals ?? [],
        hackathonInterests: profile?.hackathon_interests ?? [],
      }

      // Check if existing prep plan is current
      const existingPlan = prepPlans.get(opportunity.id)
      if (existingPlan && !isPrepPlanStale(existingPlan, studentContext)) {
        setSelectedPrepPlan({ opportunity, plan: existingPlan })
        return
      }

      const plan = await generateOpportunityPrepPlan(session, user.id, opportunity, studentContext)
      if (plan) {
        setPrepPlans((prev) => new Map(prev).set(opportunity.id, plan))
        setSelectedPrepPlan({ opportunity, plan })
      }
    } catch (err) {
      console.error("Prep plan error:", err)
      setErrorMsg("Failed to generate AI preparation plan. Please try again.")
    } finally {
      setPrepId(null)
    }
  }

  async function handleOpenIntelligence(opportunity: Opportunity) {
    if (!user?.id) return
    setIntelligenceLoadingId(opportunity.id)
    setErrorMsg(null)
    try {
      const profile = await profileService.get(user.id)
      const studentContext: StudentContextPayload = {
        skills: profile?.skills ?? [],
        careerGoals: profile?.placement_goals ?? [],
        semester: profile?.semester ?? "Semester 6",
        internshipInterests: profile?.internship_goals ?? [],
        hackathonInterests: profile?.hackathon_interests ?? [],
      }

      const [sanityKnowledge, intelligence] = await Promise.all([
        getSanityOpportunityKnowledge(opportunity.id, opportunity.title, opportunity),
        generateOpportunityIntelligence({
          session,
          opportunity,
          studentContext,
        }),
      ])

      setSelectedIntelligenceOpp(opportunity)
      setSelectedSanityKnowledge(sanityKnowledge)
      setSelectedIntelligenceResult(intelligence)
      setIntelligenceStudentContext(studentContext)
      setIsDrawerOpen(true)
    } catch (err) {
      console.error("Opportunity Intelligence generation error:", err)
      setErrorMsg("Failed to load Opportunity Intelligence. Please check your network connection.")
    } finally {
      setIntelligenceLoadingId(null)
    }
  }

  async function handleConvertToStudentTask(taskTitle: string) {
    if (!user?.id) return
    const success = await createTaskFromOpportunityMilestone(user.id, taskTitle)
    if (success) {
      setAddedTasks((prev) => new Set(prev).add(taskTitle))
    }
  }

  // Filter & Sort Logic
  const filteredOpportunities = opportunities
    .filter((opp) => {
      const query = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !query ||
        opp.title.toLowerCase().includes(query) ||
        opp.organization.toLowerCase().includes(query) ||
        opp.category.toLowerCase().includes(query) ||
        opp.type.toLowerCase().includes(query) ||
        opp.required_skills.some((s) => s.toLowerCase().includes(query))
      const matchesType = selectedType === "all" || opp.type === selectedType
      return matchesSearch && matchesType
    })
    .sort((a, b) => {
      if (sortOption === "match_desc") {
        const scoreA = matches.get(a.id)?.match_score ?? -1
        const scoreB = matches.get(b.id)?.match_score ?? -1
        return scoreB - scoreA
      }
      if (sortOption === "title_asc") return a.title.localeCompare(b.title)
      if (sortOption === "verified_first") {
        if (a.verification_state === b.verification_state) return 0
        return a.verification_state === "verified" ? -1 : 1
      }
      if (sortOption === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return 0
    })

  const savedOpportunities = opportunities.filter((opp) => savedIds.has(opp.id))

  const applicationPipeline = opportunities
    .filter((opp) => applications.has(opp.id))
    .map((opp) => ({ opportunity: opp, status: applications.get(opp.id)! }))
    .filter(({ status }) => statusFilter === "all" || status === statusFilter)

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Hydrating Opportunity Intelligence Catalog…</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Opportunity Intelligence</h1>
            <Badge className="border-primary/40 bg-primary/10 text-primary">Live Verified Catalog</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated hackathons, fellowships, internships, competitions, and ambassador programs with 50/30/20 fit scoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setActiveTab("radar")}
            className="w-fit"
          >
            <Radio className="size-3.5 mr-1.5 text-primary-foreground animate-pulse" /> Launch Radar
          </Button>
          <Button variant="secondary" size="sm" onClick={handleRefresh} className="w-fit">
            <RefreshCw className="size-3.5 mr-1.5" /> Refresh Catalog
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          <span>{errorMsg}</span>
          <Button variant="ghost" size="sm" onClick={() => setErrorMsg(null)} className="text-xs h-7">
            Dismiss
          </Button>
        </div>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="bg-card/60 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Trophy className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{opportunities.length}</p>
                <p className="text-xs text-muted-foreground">Verified Opportunities</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                <Bookmark className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{savedIds.size}</p>
                <p className="text-xs text-muted-foreground">Saved Bookmarks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <Layers className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{applications.size}</p>
                <p className="text-xs text-muted-foreground">Tracked Applications</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{prepPlans.size}</p>
                <p className="text-xs text-muted-foreground">AI Prep Plans</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-3 overflow-x-auto">
        {(
          [
            { id: "radar", label: "Opportunity Radar" },
            { id: "catalog", label: `Catalog (${opportunities.length})` },
            { id: "saved", label: `Saved (${savedIds.size})` },
            { id: "applications", label: `Applications (${applications.size})` },
            { id: "prep", label: `AI Prep Plans (${prepPlans.size})` },
          ] as const
        ).map((t) => (
          <Button
            key={t.id}
            variant={activeTab === t.id ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(t.id)}
            className="text-xs font-semibold shrink-0"
          >
            {t.id === "radar" && <Radio className="size-3.5 mr-1.5 text-primary animate-pulse" />}
            {t.label}
          </Button>
        ))}
      </div>

      {/* TAB 0: RADAR VIEW */}
      {activeTab === "radar" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-primary animate-pulse" />
                <h3 className="font-semibold text-sm text-foreground">Deterministic Opportunity Radar</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Actionable priority ranking derived from 50/30/20 fit score, deadline urgency, recency & prep status.
              </p>
            </div>
            <Button asChild size="sm" variant="secondary" className="text-xs shrink-0 w-fit">
              <Link to="/app/radar">
                Full Page Radar <ExternalLink className="size-3 ml-1" />
              </Link>
            </Button>
          </div>

          {radarResult ? (
            <RadarWidget radar={radarResult} />
          ) : (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Evaluating Radar Signals...</span>
            </div>
          )}
        </div>
      )}

      {/* TAB 1: CATALOG VIEW */}
      {activeTab === "catalog" && (
        <div className="space-y-6">
          {/* Fresh Opportunities Discovery Section */}
          <FreshOpportunitiesSection studentContext={studentContextPayload} />

          {/* Controls: Search, Filter, Sort */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, organization, category, or skill..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                <Filter className="size-3.5 text-muted-foreground shrink-0" />
                {(["all", "ambassador", "hackathon", "fellowship", "competition", "internship", "job", "grant"] as const).map((type) => (
                  <Button
                    key={type}
                    variant={selectedType === type ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setSelectedType(type)}
                    className="capitalize text-xs shrink-0 h-8 px-2.5"
                  >
                    {type}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="match_desc">Highest Fit First</option>
                  <option value="title_asc">Title (A-Z)</option>
                  <option value="verified_first">Verified First</option>
                  <option value="newest">Recently Added</option>
                </select>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {filteredOpportunities.length === 0 && (
            <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
              <Search className="size-10 text-muted-foreground/60 mb-3" />
              <h3 className="font-semibold text-lg">No matching opportunities found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Try adjusting your search keywords or resetting filters to explore the catalog.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery("")
                  setSelectedType("all")
                }}
                className="mt-4"
              >
                Clear Search Filters
              </Button>
            </div>
          )}

          {/* Cards Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredOpportunities.map((opp) => {
              const isSaved = savedIds.has(opp.id)
              const match = matches.get(opp.id)
              const hasPrep = prepPlans.has(opp.id)
              const appStatus = applications.get(opp.id)

              return (
                <Card
                  key={opp.id}
                  className="flex flex-col justify-between bg-card/60 backdrop-blur-xl border-border/80 hover:border-primary/50 transition-colors"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className="bg-primary/10 text-primary capitalize text-[11px] font-semibold">{opp.type}</Badge>
                        <Badge className="bg-muted/80 text-foreground text-[10px] font-medium">{opp.category}</Badge>
                        <Badge
                          className={`text-[10px] ${
                            opp.verification_state === "verified"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {opp.verification_state}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {match && (
                          <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold text-[11px]">
                            {match.match_score}% Fit
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0"
                          onClick={() => handleToggleSave(opp.id)}
                          aria-label={isSaved ? "Unsave opportunity" : "Save opportunity"}
                        >
                          {isSaved ? (
                            <BookmarkCheck className="size-4 text-primary fill-primary" />
                          ) : (
                            <Bookmark className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <CardTitle
                      className="text-base font-semibold line-clamp-1 mt-1 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setSelectedOpportunity(opp)}
                    >
                      {opp.title}
                    </CardTitle>
                    <CardDescription className="text-xs font-medium text-foreground/80">{opp.organization}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm flex-1">
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{opp.description}</p>

                    {opp.stipend_prize && (
                      <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 p-2 rounded-lg">
                        <Trophy className="size-3.5 shrink-0" />
                        <span className="truncate">{opp.stipend_prize}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {opp.required_skills.map((skill) => (
                        <Badge key={skill} className="text-[10px] bg-muted/50 text-muted-foreground border-border">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>

                  <div className="p-5 pt-0 space-y-2 border-t border-border/40 mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3">
                      <span>{opp.location}</span>
                      <span className="text-[11px] italic font-medium text-foreground/80">
                        {formatApplicationWindow(opp)}
                      </span>
                    </div>

                    <div className="pt-2 space-y-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleOpenIntelligence(opp)}
                        disabled={intelligenceLoadingId === opp.id}
                        className="w-full text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm flex items-center justify-center gap-1.5"
                      >
                        {intelligenceLoadingId === opp.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        Am I actually ready for this?
                      </Button>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRunMatch(opp)}
                          disabled={matchingId === opp.id}
                          className="text-xs"
                        >
                          {matchingId === opp.id ? (
                            <Loader2 className="size-3 animate-spin mr-1" />
                          ) : (
                            <Zap className="size-3 text-amber-400 mr-1" />
                          )}
                          {match ? "View Fit" : "Analyze Fit"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRunPrepPlan(opp)}
                          disabled={prepId === opp.id}
                          className="text-xs"
                        >
                          {prepId === opp.id ? (
                            <Loader2 className="size-3 animate-spin mr-1" />
                          ) : (
                            <Sparkles className="size-3 text-primary mr-1" />
                          )}
                          {hasPrep ? "View Plan" : "Prep Plan"}
                        </Button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <select
                        value={appStatus ?? "not_applied"}
                        onChange={(e) => {
                          const val = e.target.value as ApplicationStatus | "not_applied"
                          if (val !== "not_applied") handleStatusChange(opp.id, val)
                        }}
                        className="w-full rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="not_applied">Tracker: Not Applied</option>
                        {ALL_APPLICATION_STATUSES.map((st) => (
                          <option key={st.value} value={st.value}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 2: SAVED OPPORTUNITIES */}
      {activeTab === "saved" && (
        <div>
          {savedOpportunities.length === 0 ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
              <Bookmark className="size-10 text-muted-foreground/60 mb-3" />
              <h3 className="font-semibold text-lg">No saved opportunities yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Bookmark hackathons and internships in the catalog to quickly return to them later.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {savedOpportunities.map((opp) => (
                <Card key={opp.id} className="bg-card/60 backdrop-blur-xl">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <Badge className="bg-muted text-foreground capitalize text-xs">{opp.type}</Badge>
                      <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => handleToggleSave(opp.id)}>
                        <BookmarkCheck className="size-4 text-primary fill-primary" />
                      </Button>
                    </div>
                    <CardTitle className="text-base font-semibold mt-2">{opp.title}</CardTitle>
                    <CardDescription className="text-xs">{opp.organization}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground line-clamp-2">{opp.description}</p>
                    <a
                      href={opp.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      Visit Official Platform <ExternalLink className="size-3" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: APPLICATION TRACKER */}
      {activeTab === "applications" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <Filter className="size-3.5 text-muted-foreground shrink-0" />
            <Button
              variant={statusFilter === "all" ? "default" : "secondary"}
              size="sm"
              onClick={() => setStatusFilter("all")}
              className="text-xs h-8"
            >
              All States ({applications.size})
            </Button>
            {ALL_APPLICATION_STATUSES.map((st) => {
              const count = Array.from(applications.values()).filter((s) => s === st.value).length
              if (count === 0 && statusFilter !== st.value) return null
              return (
                <Button
                  key={st.value}
                  variant={statusFilter === st.value ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setStatusFilter(st.value)}
                  className="text-xs h-8 shrink-0"
                >
                  {st.label} ({count})
                </Button>
              )
            })}
          </div>

          {applicationPipeline.length === 0 ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
              <Briefcase className="size-10 text-muted-foreground/60 mb-3" />
              <h3 className="font-semibold text-lg">No applications matching this filter</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Select an application status on any opportunity card to manage your pipeline across all 10 supported states.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {applicationPipeline.map(({ opportunity, status }) => (
                <Card
                  key={opportunity.id}
                  className="bg-card/60 backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-muted text-foreground capitalize text-xs">{opportunity.type}</Badge>
                      <h4 className="font-semibold text-sm">{opportunity.title}</h4>
                      <span className="text-xs text-muted-foreground">• {opportunity.organization}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{opportunity.description.slice(0, 120)}...</p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-end">
                    <select
                      value={status}
                      onChange={(e) => handleStatusChange(opportunity.id, e.target.value as ApplicationStatus)}
                      className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-semibold"
                    >
                      {ALL_APPLICATION_STATUSES.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                    <a
                      href={opportunity.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      Official Link <ExternalLink className="size-3" />
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AI PREPARATION PLANS & TASK INTEGRATION */}
      {activeTab === "prep" && (
        <div>
          {prepPlans.size === 0 ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center">
              <Sparkles className="size-10 text-primary/60 mb-3" />
              <h3 className="font-semibold text-lg">No AI Prep Plans generated yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Click "Prep Plan" on any opportunity card to generate a step-by-step roadmap and convert milestones into StudentOS workspace tasks.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {Array.from(prepPlans.entries()).map(([oppId, plan]) => {
                const opp = opportunities.find((o) => o.id === oppId)
                if (!opp) return null
                return (
                  <Card key={oppId} className="bg-card/60 backdrop-blur-xl">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <Badge className="border-primary/40 text-primary text-xs">AI Prep Plan</Badge>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedPrepPlan({ opportunity: opp, plan })}>
                          View Roadmap <ChevronRight className="size-4 ml-1" />
                        </Button>
                      </div>
                      <CardTitle className="text-base font-semibold mt-2">{opp.title}</CardTitle>
                      <CardDescription className="text-xs">{opp.organization}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">{plan.summary}</p>
                      <div className="space-y-2 pt-2">
                        {plan.key_milestones.slice(0, 2).map((m) => {
                          const taskKey = `${opp.title}: ${m.title}`
                          const isAdded = addedTasks.has(taskKey)
                          return (
                            <div
                              key={m.week}
                              className="flex items-center justify-between gap-2 text-xs bg-muted/40 p-2.5 rounded-lg"
                            >
                              <div className="flex items-start gap-2">
                                <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold">
                                    {m.week}: {m.title}
                                  </span>
                                  <p className="text-muted-foreground text-[11px] mt-0.5">{m.focus}</p>
                                </div>
                              </div>
                              <Button
                                variant={isAdded ? "secondary" : "ghost"}
                                size="sm"
                                disabled={isAdded}
                                onClick={() => handleConvertToStudentTask(taskKey)}
                                className="text-[10px] h-7 px-2 shrink-0"
                              >
                                {isAdded ? "Added ✓" : <><PlusCircle className="size-3 mr-1" /> Task</>}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: OPPORTUNITY DETAILS */}
      {selectedOpportunity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedOpportunity(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <Badge className="bg-primary/10 text-primary capitalize text-xs">{selectedOpportunity.type}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOpportunity(null)}>
                Close
              </Button>
            </div>
            <div>
              <h3 className="font-bold text-xl">{selectedOpportunity.title}</h3>
              <p className="text-xs text-muted-foreground">{selectedOpportunity.organization} • {selectedOpportunity.location}</p>
            </div>
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-foreground">Program Overview:</p>
              <p className="text-muted-foreground bg-muted/40 p-3 rounded-xl leading-relaxed">{selectedOpportunity.description}</p>
            </div>
            {selectedOpportunity.eligibility.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold">Eligibility Criteria:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
                  {selectedOpportunity.eligibility.map((el, idx) => (
                    <li key={idx}>{el}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-1.5 text-xs">
              <p className="font-semibold">Required Technical Skills:</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedOpportunity.required_skills.map((s) => (
                  <Badge key={s} className="bg-muted text-muted-foreground">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-border/60">
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs py-2.5 flex items-center justify-center gap-2 rounded-xl shadow-md"
                onClick={() => handleOpenIntelligence(selectedOpportunity)}
                disabled={intelligenceLoadingId === selectedOpportunity.id}
              >
                {intelligenceLoadingId === selectedOpportunity.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Am I actually ready for this opportunity?
              </Button>
            </div>
            <div className="pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedOpportunity.deadline ? `Deadline: ${new Date(selectedOpportunity.deadline).toLocaleDateString()}` : "Deadline not specified"}
              </span>
              <a
                href={selectedOpportunity.source_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold bg-primary/10 px-3 py-1.5 rounded-lg"
              >
                Visit Official Platform <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DETERMINISTIC MATCH INSIGHTS */}
      {selectedMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedMatch(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="size-5 text-amber-400" />
                <h3 className="font-bold text-lg">Deterministic Match Insights</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedMatch(null)}>
                Close
              </Button>
            </div>

            <div>
              <h4 className="font-semibold text-base">{selectedMatch.opportunity.title}</h4>
              <p className="text-xs text-muted-foreground">{selectedMatch.opportunity.organization}</p>
            </div>

            {/* Formula Banner */}
            <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Info className="size-4 text-primary shrink-0" />
              <span>Score calculated deterministically in TypeScript: 50% Skill Fit, 30% Goal Alignment, 20% Eligibility & Location.</span>
            </div>

            {/* Score Gauges */}
            <div className="grid grid-cols-3 gap-3 text-center py-1">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-2xl font-extrabold text-emerald-400">{selectedMatch.match.match_score}%</p>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mt-1">Final Score</p>
              </div>
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                <p className="text-2xl font-extrabold text-cyan-400">{selectedMatch.match.skill_match_score}%</p>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mt-1">Skill Fit (50%)</p>
              </div>
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
                <p className="text-2xl font-extrabold text-purple-400">{selectedMatch.match.goal_match_score}%</p>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mt-1">Goal Fit (30%)</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-semibold">Qualitative Rationale:</p>
              <p className="text-muted-foreground bg-muted/40 p-3 rounded-xl leading-relaxed">{selectedMatch.match.explanation}</p>
            </div>

            {selectedMatch.match.strengths.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-emerald-400">Key Strengths:</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedMatch.match.strengths.map((s) => (
                    <Badge key={s} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                      ✓ {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedMatch.match.missing_skills.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-amber-400">Skills to Build:</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedMatch.match.missing_skills.map((s) => (
                    <Badge key={s} className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                      + {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: AI PREP PLAN & TASK CONVERSION */}
      {selectedPrepPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedPrepPlan(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 my-8 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <h3 className="font-bold text-lg">Personalized AI Preparation Plan</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPrepPlan(null)}>
                Close
              </Button>
            </div>

            <div>
              <h4 className="font-bold text-lg">{selectedPrepPlan.opportunity.title}</h4>
              <p className="text-xs text-muted-foreground">
                {selectedPrepPlan.opportunity.organization} • {selectedPrepPlan.opportunity.type}
              </p>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs space-y-1.5">
              <p className="font-semibold text-primary">Executive Summary</p>
              <p className="text-foreground/90 leading-relaxed">{selectedPrepPlan.plan.summary}</p>
            </div>

            <div className="space-y-3">
              <h5 className="font-semibold text-sm">4-Week Preparation Milestones & Task Conversion</h5>
              <div className="space-y-3">
                {selectedPrepPlan.plan.key_milestones.map((m) => {
                  const milestoneTaskKey = `${selectedPrepPlan.opportunity.title}: ${m.title}`
                  const isAdded = addedTasks.has(milestoneTaskKey)
                  return (
                    <div key={m.week} className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-primary">
                          {m.week}: {m.title}
                        </span>
                        <Button
                          variant={isAdded ? "secondary" : "default"}
                          size="sm"
                          disabled={isAdded}
                          onClick={() => handleConvertToStudentTask(milestoneTaskKey)}
                          className="text-xs h-7 px-3"
                        >
                          {isAdded ? "Added to Tasks ✓" : <><PlusCircle className="size-3.5 mr-1" /> Add to Tasks</>}
                        </Button>
                      </div>
                      <p className="text-xs font-medium text-foreground/80">{m.focus}</p>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
                        {m.action_items.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>

            {selectedPrepPlan.plan.recommended_projects?.length > 0 && (
              <div className="space-y-2 text-xs">
                <p className="font-semibold">Recommended Portfolio Focus:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
                  {selectedPrepPlan.plan.recommended_projects.map((proj, idx) => (
                    <li key={idx}>{proj}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: OPPORTUNITY INTELLIGENCE DRAWER */}
      {selectedIntelligenceOpp && selectedIntelligenceResult && intelligenceStudentContext && (
        <OpportunityIntelligenceDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          opportunity={selectedIntelligenceOpp}
          studentContext={intelligenceStudentContext}
          sanityKnowledge={selectedSanityKnowledge}
          intelligence={selectedIntelligenceResult}
          session={session}
        />
      )}
    </div>
  )
}
