"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { formatRelativeTime, normalizeUrl } from "@/lib/utils"

type ProductInfo = {
  name: string
  description: string
  targetAudience: string
  url: string
  pageContext?: string
}

type RedditThread = {
  redditThreadId: string
  title: string
  bodyPreview: string
  subreddit: string
  url: string
  createdUtc: number
}

type WizardState = {
  step: number
  url: string
  productInfo: ProductInfo | null
  keywords: string[]
  threads: RedditThread[]
}

const TOTAL_STEPS = 5

type NavigationButtonsProps = {
  onBack: () => void
  onContinue?: () => void
  continueDisabled?: boolean
  continueLabel?: string
  isLoading?: boolean
  loadingLabel?: string
  submitType?: "button" | "submit"
}

function NavigationButtons({
  onBack,
  onContinue,
  continueDisabled,
  continueLabel = "Continue",
  isLoading,
  loadingLabel,
  submitType = "button",
}: NavigationButtonsProps) {
  return (
    <div className="flex justify-between pt-2">
      <Button type="button" variant="outline" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        Back
      </Button>
      <Button
        type={submitType}
        onClick={submitType === "button" ? onContinue : undefined}
        disabled={continueDisabled || isLoading}
      >
        {isLoading ? (
          <>
            <Spinner size="sm" className="mr-2" />
            {loadingLabel}
          </>
        ) : (
          <>
            {continueLabel}
            {continueLabel !== "Save Changes" && continueLabel !== "Save & Start Monitoring" && (
              <ArrowRight data-icon="inline-end" />
            )}
          </>
        )}
      </Button>
    </div>
  )
}

type KeywordTagProps = {
  keyword: string
  onRemove: () => void
}

function KeywordTag({ keyword, onRemove }: KeywordTagProps) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm">
      {keyword}
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

type ThreadListItemProps = {
  thread: RedditThread
  isSelected?: boolean
  onClick?: () => void
  variant?: "preview" | "selectable"
}

function ThreadListItem({
  thread,
  isSelected,
  onClick,
  variant = "preview",
}: ThreadListItemProps) {
  const baseClasses = "border-b p-3 last:border-b-0"

  if (variant === "selectable") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClasses} w-full text-left hover:bg-muted/50 transition-colors ${
          isSelected ? "bg-muted" : ""
        }`}
      >
        <div className="font-medium text-sm line-clamp-2">{thread.title}</div>
        <div className="text-xs text-muted-foreground mt-1">
          r/{thread.subreddit} · {formatRelativeTime(thread.createdUtc)}
        </div>
      </button>
    )
  }

  return (
    <div className={baseClasses}>
      <div className="font-medium text-sm line-clamp-1">{thread.title}</div>
      <div className="text-xs text-muted-foreground">
        r/{thread.subreddit} · {formatRelativeTime(thread.createdUtc)}
      </div>
    </div>
  )
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNumber = i + 1
        let colorClass = "bg-muted-foreground/30"
        if (stepNumber === currentStep) colorClass = "bg-primary"
        else if (stepNumber < currentStep) colorClass = "bg-primary/50"

        return (
          <div key={i} className={`size-2 rounded-full transition-colors ${colorClass}`} />
        )
      })}
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto py-8 px-4 max-w-2xl">
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center gap-4">{children}</div>
        </CardContent>
      </Card>
    </div>
  )
}

function SetupPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editProductId = searchParams.get("edit")
  const isEditMode = !!editProductId

  const [state, setState] = useState<WizardState>({
    step: isEditMode ? 2 : 1,
    url: "",
    productInfo: null,
    keywords: [],
    threads: [],
  })
  const [isLoading, setIsLoading] = useState(isEditMode)
  const [error, setError] = useState<string | null>(null)
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false)
  const [isSearchingThreads, setIsSearchingThreads] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newKeyword, setNewKeyword] = useState("")
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  const updateProductInfo = useCallback(
    (field: keyof ProductInfo, value: string) => {
      setState((prev) => ({
        ...prev,
        productInfo: prev.productInfo ? { ...prev.productInfo, [field]: value } : null,
      }))
    },
    []
  )

  const setStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, step }))
  }, [])

  useEffect(() => {
    if (!editProductId) return

    async function loadProduct(): Promise<void> {
      try {
        const res = await fetch(`/api/products/${editProductId}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Failed to load product")
          setIsLoading(false)
          return
        }

        setState({
          step: 2,
          url: data.url,
          productInfo: {
            name: data.name,
            description: data.description || "",
            targetAudience: data.targetAudience || "",
            url: data.url,
          },
          keywords: data.keywords || [],
          threads: data.threads || [],
        })
      } catch {
        setError("Failed to connect to server")
      } finally {
        setIsLoading(false)
      }
    }

    loadProduct()
  }, [editProductId])

  const handleUrlSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const normalizedUrl = normalizeUrl(state.url)
      if (!normalizedUrl) {
        setError("Please enter a valid URL")
        return
      }

      setState((prev) => ({ ...prev, url: normalizedUrl }))
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to extract product information")
        return
      }

      setState((prev) => ({ ...prev, productInfo: data, step: 2 }))
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = (): void => {
    if (state.step === 1) {
      router.push("/dashboard")
    } else if (state.step === 2 && isEditMode) {
      router.push(`/monitor/${editProductId}`)
    } else {
      setStep(state.step - 1)
    }
  }

  const handleProductInfoSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!state.productInfo?.name?.trim()) return
    setStep(3)
  }

  const generateKeywords = useCallback(async (): Promise<void> => {
    if (!state.productInfo) return
    setIsGeneratingKeywords(true)
    setError(null)

    try {
      const response = await fetch("/api/keywords/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.productInfo.name,
          description: state.productInfo.description,
          targetAudience: state.productInfo.targetAudience,
          pageContext: state.productInfo.pageContext,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to generate keywords")
        return
      }

      setState((prev) => ({ ...prev, keywords: data.keywords }))
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsGeneratingKeywords(false)
    }
  }, [state.productInfo])

  const searchThreads = useCallback(async (keywords: string[]): Promise<void> => {
    if (keywords.length === 0) {
      setState((prev) => ({ ...prev, threads: [] }))
      return
    }

    setIsSearchingThreads(true)

    try {
      const response = await fetch("/api/threads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      })

      const data = await response.json()

      if (response.ok) {
        setState((prev) => ({ ...prev, threads: data.threads }))
      }
    } catch {
      // Silently fail thread preview
    } finally {
      setIsSearchingThreads(false)
    }
  }, [])

  useEffect(() => {
    if (state.step === 3 && state.keywords.length === 0) {
      generateKeywords()
    }
  }, [state.step, state.keywords.length, generateKeywords])

  useEffect(() => {
    if (state.step !== 3) return
    const timeoutId = setTimeout(() => searchThreads(state.keywords), 500)
    return () => clearTimeout(timeoutId)
  }, [state.step, state.keywords, searchThreads])

  const addKeyword = (): void => {
    const keyword = newKeyword.trim()
    if (!keyword || state.keywords.includes(keyword)) return
    setState((prev) => ({ ...prev, keywords: [...prev.keywords, keyword] }))
    setNewKeyword("")
  }

  const removeKeyword = (index: number): void => {
    setState((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index),
    }))
  }

  const clearKeywords = (): void => {
    setState((prev) => ({ ...prev, keywords: [], threads: [] }))
    setNewKeyword("")
    setSelectedThreadId(null)
    setError(null)
  }

  const handleKeywordsSubmit = (): void => {
    if (isEditMode) {
      setStep(5)
      return
    }
    setError(null)
    if (state.threads.length === 0) {
      setSelectedThreadId(null)
      setStep(5)
      return
    }
    setSelectedThreadId(state.threads[0]?.redditThreadId || null)
    setStep(4)
  }

  const handleSave = async (): Promise<void> => {
    if (!state.productInfo) return
    setIsSaving(true)
    setError(null)

    try {
      const url = isEditMode ? `/api/products/${editProductId}` : "/api/products"
      const method = isEditMode ? "PUT" : "POST"

      const basePayload = {
        url: state.productInfo.url,
        name: state.productInfo.name,
        description: state.productInfo.description,
        targetAudience: state.productInfo.targetAudience,
        keywords: state.keywords,
      }

      const payload = isEditMode ? basePayload : { ...basePayload, threads: state.threads }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to save product")
        return
      }

      router.push(`/monitor/${data.id}`)
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsSaving(false)
    }
  }

  const selectedThread = state.threads.find((t) => t.redditThreadId === selectedThreadId)

  if (isLoading && isEditMode) {
    return (
      <CenteredCard>
        <Spinner size="md" />
        <p className="text-muted-foreground">Loading product...</p>
      </CenteredCard>
    )
  }

  if (error && isEditMode && !state.productInfo) {
    return (
      <CenteredCard>
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </Button>
      </CenteredCard>
    )
  }

  return (
    <div className={`mx-auto py-8 px-4 ${state.step === 4 ? "max-w-4xl" : "max-w-2xl"}`}>
      <div className="mb-8">
        <StepIndicator currentStep={state.step} totalSteps={TOTAL_STEPS} />
      </div>

      {state.step === 1 && !isEditMode && (
        <StepUrlEntry
          url={state.url}
          onUrlChange={(url) => setState((prev) => ({ ...prev, url }))}
          onSubmit={handleUrlSubmit}
          onBack={handleBack}
          isLoading={isLoading}
          error={error}
        />
      )}

      {state.step === 2 && (
        <StepProductInfo
          productInfo={state.productInfo}
          onUpdateField={updateProductInfo}
          onSubmit={handleProductInfoSubmit}
          onBack={handleBack}
          isEditMode={isEditMode}
        />
      )}

      {state.step === 3 && (
        <StepKeywords
          keywords={state.keywords}
          threads={state.threads}
          newKeyword={newKeyword}
          onNewKeywordChange={setNewKeyword}
          onAddKeyword={addKeyword}
          onRemoveKeyword={removeKeyword}
          onClearKeywords={clearKeywords}
          onSubmit={handleKeywordsSubmit}
          onBack={handleBack}
          isGeneratingKeywords={isGeneratingKeywords}
          isSearchingThreads={isSearchingThreads}
          error={error}
        />
      )}

      {state.step === 4 && (
        <StepThreadReview
          threads={state.threads}
          selectedThreadId={selectedThreadId}
          selectedThread={selectedThread}
          onSelectThread={setSelectedThreadId}
          onSubmit={() => setStep(5)}
          onBack={handleBack}
        />
      )}

      {state.step === 5 && (
        <StepConfirmation
          productInfo={state.productInfo}
          keywords={state.keywords}
          threads={state.threads}
          onSave={handleSave}
          onBack={handleBack}
          isEditMode={isEditMode}
          isSaving={isSaving}
          error={error}
        />
      )}
    </div>
  )
}

type StepUrlEntryProps = {
  url: string
  onUrlChange: (url: string) => void
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
  isLoading: boolean
  error: string | null
}

function StepUrlEntry({
  url,
  onUrlChange,
  onSubmit,
  onBack,
  isLoading,
  error,
}: StepUrlEntryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add your product</CardTitle>
        <CardDescription>
          Enter your product&apos;s URL and we&apos;ll automatically extract information about it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              inputMode="url"
              placeholder="https://yourproduct.com"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              className="pl-10"
              required
              disabled={isLoading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <NavigationButtons
            onBack={onBack}
            submitType="submit"
            continueDisabled={!url}
            isLoading={isLoading}
            loadingLabel="Extracting..."
          />
        </form>
      </CardContent>
    </Card>
  )
}

type StepProductInfoProps = {
  productInfo: ProductInfo | null
  onUpdateField: (field: keyof ProductInfo, value: string) => void
  onSubmit: (e: React.FormEvent) => void
  onBack: () => void
  isEditMode: boolean
}

function StepProductInfo({
  productInfo,
  onUpdateField,
  onSubmit,
  onBack,
  isEditMode,
}: StepProductInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit product" : "Review product information"}</CardTitle>
        <CardDescription>
          {isEditMode
            ? "Update your product information and keywords."
            : "Verify and edit the extracted information about your product."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Product name
            </label>
            <Input
              id="name"
              value={productInfo?.name || ""}
              onChange={(e) => onUpdateField("name", e.target.value)}
              placeholder="My Product"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="description"
              value={productInfo?.description || ""}
              onChange={(e) => onUpdateField("description", e.target.value)}
              placeholder="Describe what your product does"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="targetAudience" className="text-sm font-medium">
              Target audience
            </label>
            <Textarea
              id="targetAudience"
              value={productInfo?.targetAudience || ""}
              onChange={(e) => onUpdateField("targetAudience", e.target.value)}
              placeholder="Who is this product for?"
              rows={2}
            />
          </div>

          <NavigationButtons
            onBack={onBack}
            submitType="submit"
            continueDisabled={!productInfo?.name?.trim()}
          />
        </form>
      </CardContent>
    </Card>
  )
}

type StepKeywordsProps = {
  keywords: string[]
  threads: RedditThread[]
  newKeyword: string
  onNewKeywordChange: (value: string) => void
  onAddKeyword: () => void
  onRemoveKeyword: (index: number) => void
  onClearKeywords: () => void
  onSubmit: () => void
  onBack: () => void
  isGeneratingKeywords: boolean
  isSearchingThreads: boolean
  error: string | null
}

function StepKeywords({
  keywords,
  threads,
  newKeyword,
  onNewKeywordChange,
  onAddKeyword,
  onRemoveKeyword,
  onClearKeywords,
  onSubmit,
  onBack,
  isGeneratingKeywords,
  isSearchingThreads,
  error,
}: StepKeywordsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search keywords</CardTitle>
        <CardDescription>
          Add keywords to find relevant Reddit discussions. Keywords are auto-generated based on
          your product.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isGeneratingKeywords ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" className="mr-2" />
            <span className="text-muted-foreground">Generating keywords...</span>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a keyword..."
                  value={newKeyword}
                  onChange={(e) => onNewKeywordChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      onAddKeyword()
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={onAddKeyword}>
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword, index) => (
                  <KeywordTag
                    key={index}
                    keyword={keyword}
                    onRemove={() => onRemoveKeyword(index)}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {keywords.length} keyword{keywords.length === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClearKeywords}
                  disabled={keywords.length === 0}
                >
                  Clear keywords
                </Button>
              </div>
            </div>

            <ThreadPreview
              threads={threads}
              keywords={keywords}
              isSearching={isSearchingThreads}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <NavigationButtons
              onBack={onBack}
              onContinue={onSubmit}
              continueDisabled={isSearchingThreads || keywords.length === 0}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

type ThreadPreviewProps = {
  threads: RedditThread[]
  keywords: string[]
  isSearching: boolean
}

function ThreadPreview({ threads, keywords, isSearching }: ThreadPreviewProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Thread preview</span>
        {isSearching && <Spinner size="sm" />}
      </div>

      {threads.length > 0 ? (
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {threads.slice(0, 5).map((thread) => (
            <ThreadListItem key={thread.redditThreadId} thread={thread} variant="preview" />
          ))}
          {threads.length > 5 && (
            <div className="p-3 text-center text-sm text-muted-foreground">
              +{threads.length - 5} more threads
            </div>
          )}
        </div>
      ) : (
        !isSearching &&
        keywords.length > 0 && (
          <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
            No threads found yet. You can continue and we&apos;ll keep monitoring for matches.
          </div>
        )
      )}
    </div>
  )
}

type StepThreadReviewProps = {
  threads: RedditThread[]
  selectedThreadId: string | null
  selectedThread: RedditThread | undefined
  onSelectThread: (id: string) => void
  onSubmit: () => void
  onBack: () => void
}

function StepThreadReview({
  threads,
  selectedThreadId,
  selectedThread,
  onSelectThread,
  onSubmit,
  onBack,
}: StepThreadReviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review threads</CardTitle>
        <CardDescription>
          Browse the discovered threads and select ones relevant to your product.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 min-h-[400px]">
          <div className="w-2/5 border rounded-md overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              {threads.map((thread) => (
                <ThreadListItem
                  key={thread.redditThreadId}
                  thread={thread}
                  variant="selectable"
                  isSelected={selectedThreadId === thread.redditThreadId}
                  onClick={() => onSelectThread(thread.redditThreadId)}
                />
              ))}
            </div>
          </div>

          <div className="w-3/5 border rounded-md p-4">
            {selectedThread ? (
              <ThreadDetail thread={selectedThread} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a thread to view details
              </div>
            )}
          </div>
        </div>

        <div className="pt-6">
          <NavigationButtons onBack={onBack} onContinue={onSubmit} />
        </div>
      </CardContent>
    </Card>
  )
}

function ThreadDetail({ thread }: { thread: RedditThread }) {
  const bodyPreview =
    thread.bodyPreview.length > 200
      ? `${thread.bodyPreview.slice(0, 200)}...`
      : thread.bodyPreview || "No preview available"

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{thread.title}</h3>
      <p className="text-sm text-muted-foreground">{bodyPreview}</p>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>r/{thread.subreddit}</span>
        <span>{formatRelativeTime(thread.createdUtc)}</span>
      </div>
      <a
        href={thread.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        Open in Reddit
        <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

type StepConfirmationProps = {
  productInfo: ProductInfo | null
  keywords: string[]
  threads: RedditThread[]
  onSave: () => void
  onBack: () => void
  isEditMode: boolean
  isSaving: boolean
  error: string | null
}

function StepConfirmation({
  productInfo,
  keywords,
  threads,
  onSave,
  onBack,
  isEditMode,
  isSaving,
  error,
}: StepConfirmationProps) {
  const saveLabel = isEditMode ? "Save Changes" : "Save & Start Monitoring"
  const savingLabel = isEditMode ? "Updating..." : "Saving..."

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Save changes" : "Ready to start monitoring"}</CardTitle>
        <CardDescription>
          {isEditMode
            ? "Review your changes before saving."
            : "Review your setup and save to start discovering engagement opportunities."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="rounded-md border p-4 space-y-2">
            <h4 className="font-medium">{productInfo?.name}</h4>
            {productInfo?.description && (
              <p className="text-sm text-muted-foreground">{productInfo.description}</p>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{keywords.length} keywords</span>
            {!isEditMode && <span>{threads.length} threads found</span>}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <NavigationButtons
          onBack={onBack}
          onContinue={onSave}
          continueLabel={saveLabel}
          isLoading={isSaving}
          loadingLabel={savingLabel}
        />
      </CardContent>
    </Card>
  )
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <CenteredCard>
          <Spinner size="md" />
          <p className="text-muted-foreground">Loading...</p>
        </CenteredCard>
      }
    >
      <SetupPageContent />
    </Suspense>
  )
}
