"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Globe, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

type ProductInfo = {
  name: string
  description: string
  targetAudience: string
  url: string
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

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`size-2 rounded-full transition-colors ${
            i + 1 === currentStep
              ? "bg-primary"
              : i + 1 < currentStep
                ? "bg-primary/50"
                : "bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  )
}

export default function SetupPage() {
  const router = useRouter()
  const [state, setState] = useState<WizardState>({
    step: 1,
    url: "",
    productInfo: null,
    keywords: [],
    threads: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false)
  const [isSearchingThreads, setIsSearchingThreads] = useState(false)
  const [newKeyword, setNewKeyword] = useState("")

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: state.url }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to extract product information")
        return
      }

      setState((prev) => ({
        ...prev,
        productInfo: data,
        step: 2,
      }))
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    if (state.step === 1) {
      router.push("/dashboard")
    } else {
      setState((prev) => ({ ...prev, step: prev.step - 1 }))
    }
  }

  const handleProductInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!state.productInfo?.name?.trim()) return
    setState((prev) => ({ ...prev, step: 3 }))
  }

  const generateKeywords = useCallback(async () => {
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

  const searchThreads = useCallback(async (keywords: string[]) => {
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
    const timeoutId = setTimeout(() => {
      searchThreads(state.keywords)
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [state.step, state.keywords, searchThreads])

  const addKeyword = () => {
    const keyword = newKeyword.trim()
    if (!keyword || state.keywords.includes(keyword)) return
    setState((prev) => ({ ...prev, keywords: [...prev.keywords, keyword] }))
    setNewKeyword("")
  }

  const removeKeyword = (index: number) => {
    setState((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index),
    }))
  }

  const handleKeywordsSubmit = () => {
    if (state.threads.length === 0) {
      setError("No threads found. Add or modify keywords to find relevant discussions.")
      return
    }
    setError(null)
    setState((prev) => ({ ...prev, step: 4 }))
  }

  const formatRelativeTime = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp)
    if (seconds < 60) return "just now"
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      <div className="mb-8">
        <StepIndicator currentStep={state.step} totalSteps={TOTAL_STEPS} />
      </div>

      {state.step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Add your product</CardTitle>
            <CardDescription>
              Enter your product&apos;s URL and we&apos;ll automatically extract information about it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  type="url"
                  placeholder="https://yourproduct.com"
                  value={state.url}
                  onChange={(e) => setState((prev) => ({ ...prev, url: e.target.value }))}
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={handleBack}>
                  <ArrowLeft data-icon="inline-start" />
                  Back
                </Button>
                <Button type="submit" disabled={isLoading || !state.url}>
                  {isLoading ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight data-icon="inline-end" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {state.step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Review product information</CardTitle>
            <CardDescription>
              Verify and edit the extracted information about your product.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProductInfoSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Product name
                </label>
                <Input
                  id="name"
                  value={state.productInfo?.name || ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      productInfo: prev.productInfo
                        ? { ...prev.productInfo, name: e.target.value }
                        : null,
                    }))
                  }
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
                  value={state.productInfo?.description || ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      productInfo: prev.productInfo
                        ? { ...prev.productInfo, description: e.target.value }
                        : null,
                    }))
                  }
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
                  value={state.productInfo?.targetAudience || ""}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      productInfo: prev.productInfo
                        ? { ...prev.productInfo, targetAudience: e.target.value }
                        : null,
                    }))
                  }
                  placeholder="Who is this product for?"
                  rows={2}
                />
              </div>

              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={handleBack}>
                  <ArrowLeft data-icon="inline-start" />
                  Back
                </Button>
                <Button type="submit" disabled={!state.productInfo?.name?.trim()}>
                  Continue
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {state.step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Search keywords</CardTitle>
            <CardDescription>
              Add keywords to find relevant Reddit discussions. Keywords are auto-generated based on your product.
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
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addKeyword()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addKeyword}>
                      <Plus className="size-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {state.keywords.map((keyword, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm"
                      >
                        {keyword}
                        <button
                          type="button"
                          onClick={() => removeKeyword(index)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Thread preview</span>
                    {isSearchingThreads && <Spinner size="sm" />}
                  </div>

                  {state.threads.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto rounded-md border">
                      {state.threads.slice(0, 5).map((thread) => (
                        <div
                          key={thread.redditThreadId}
                          className="border-b p-3 last:border-b-0"
                        >
                          <div className="font-medium text-sm line-clamp-1">{thread.title}</div>
                          <div className="text-xs text-muted-foreground">
                            r/{thread.subreddit} · {formatRelativeTime(thread.createdUtc)}
                          </div>
                        </div>
                      ))}
                      {state.threads.length > 5 && (
                        <div className="p-3 text-center text-sm text-muted-foreground">
                          +{state.threads.length - 5} more threads
                        </div>
                      )}
                    </div>
                  ) : (
                    !isSearchingThreads && state.keywords.length > 0 && (
                      <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                        No threads found for these keywords
                      </div>
                    )
                  )}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" onClick={handleBack}>
                    <ArrowLeft data-icon="inline-start" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleKeywordsSubmit}
                    disabled={isSearchingThreads || state.keywords.length === 0}
                  >
                    Continue
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
