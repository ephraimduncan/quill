"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ExternalLink, X, RotateCcw, RefreshCw, Settings, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ResponseEditorPanel } from "@/components/response-editor-panel"
import { toast } from "sonner"

type Thread = {
  id: string
  redditThreadId: string
  title: string
  bodyPreview: string
  subreddit: string
  url: string
  createdUtc: number
  discoveredAt: number
  status: "active" | "dismissed"
  isNew: boolean
  matchedKeyword: string | null
  generatedResponse: string | null
  customInstructions: string | null
  relevanceScore: number | null
}

type Product = {
  id: string
  name: string
  description: string
  targetAudience: string
  url: string
  keywords: string[]
  threads: Thread[]
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return "No preview available"
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

type ThreadMetadataProps = {
  subreddit: string
  createdUtc: number
  matchedKeyword: string | null
}

function ThreadMetadata({ subreddit, createdUtc, matchedKeyword }: ThreadMetadataProps): React.ReactElement {
  return (
    <div className="text-xs text-muted-foreground mt-1">
      {matchedKeyword && (
        <span className="inline-flex items-center gap-1 mr-2">
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 font-normal">
            {matchedKeyword}
          </Badge>
        </span>
      )}
      r/{subreddit} · {formatRelativeTime(createdUtc)}
    </div>
  )
}

export default function MonitorPage() {
  const params = useParams()
  const productId = params.productId as string

  const [product, setProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("threads")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [threadResponses, setThreadResponses] = useState<Record<string, string>>({})
  const [threadCustomInstructions, setThreadCustomInstructions] = useState<Record<string, string>>({})
  const [threadRelevance, setThreadRelevance] = useState<Record<string, number>>({})
  // Track thread that should stay in Threads tab until user navigates away
  const [keepInThreadsId, setKeepInThreadsId] = useState<string | null>(null)

  const updateThread = useCallback((threadId: string, updates: Partial<Thread>) => {
    setProduct((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        threads: prev.threads.map((t) =>
          t.id === threadId ? { ...t, ...updates } : t
        ),
      }
    })
  }, [])

  useEffect(() => {
    async function fetchData() {
      try {
        const productRes = await fetch(`/api/products/${productId}`)

        const productData = await productRes.json()
        if (!productRes.ok) {
          setError(productData.error || "Failed to load product")
          return
        }

        setProduct(productData)

        const responses: Record<string, string> = {}
        const instructions: Record<string, string> = {}
        const relevance: Record<string, number> = {}
        for (const t of productData.threads as Thread[]) {
          if (t.generatedResponse) responses[t.id] = t.generatedResponse
          if (t.customInstructions) instructions[t.id] = t.customInstructions
          if (t.relevanceScore !== null) relevance[t.id] = t.relevanceScore
        }
        setThreadResponses(responses)
        setThreadCustomInstructions(instructions)
        setThreadRelevance(relevance)

        const activeThreads = productData.threads
          .filter((t: Thread) => t.status === "active")
          .sort((a: Thread, b: Thread) => b.discoveredAt - a.discoveredAt)
        if (activeThreads.length > 0) {
          setSelectedThreadId(activeThreads[0].id)
        }

        // Auto-dismiss old posts that already have low relevance scores
        const threadsWithLowRelevance = productData.threads.filter(
          (t: Thread) => t.status === "active" && t.relevanceScore !== null && t.relevanceScore < 30
        )
        for (const t of threadsWithLowRelevance) {
          setProduct(prev => {
            if (!prev) return prev
            return {
              ...prev,
              threads: prev.threads.map(th =>
                th.id === t.id ? { ...th, status: "dismissed", isNew: false } : th
              )
            }
          })
          fetch(`/api/threads/${t.id}/dismiss`, { method: "POST" })
        }

        // Prefetch relevance for threads without scores
        const threadsWithoutRelevance = productData.threads.filter(
          (t: Thread) => t.status === "active" && t.relevanceScore === null
        )
        for (const t of threadsWithoutRelevance) {
          fetch("/api/response/relevance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thread: { title: t.title, body: t.bodyPreview, subreddit: t.subreddit },
              product: { name: productData.name, description: productData.description, targetAudience: productData.targetAudience }
            })
          })
            .then(res => res.json())
            .then(async data => {
              if (typeof data.relevance === "number") {
                setThreadRelevance(prev => ({ ...prev, [t.id]: data.relevance }))

                if (data.relevance < 30) {
                  setProduct(prev => {
                    if (!prev) return prev
                    return {
                      ...prev,
                      threads: prev.threads.map(th =>
                        th.id === t.id ? { ...th, status: "dismissed", isNew: false } : th
                      )
                    }
                  })
                  fetch(`/api/threads/${t.id}/dismiss`, { method: "POST" })
                }

                // Auto-generate response for green threshold (>=70%) threads
                if (data.relevance >= 70) {
                  try {
                    const generateRes = await fetch("/api/response/generate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        thread: { title: t.title, body: t.bodyPreview, subreddit: t.subreddit },
                        product: { name: productData.name, url: productData.url, description: productData.description, targetAudience: productData.targetAudience }
                      })
                    })
                    const generateData = await generateRes.json()
                    if (generateRes.ok && generateData.response) {
                      setThreadResponses(prev => ({ ...prev, [t.id]: generateData.response }))
                      fetch(`/api/threads/${t.id}/response`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ relevanceScore: data.relevance, generatedResponse: generateData.response })
                      })
                      return
                    }
                  } catch {
                    // Fall through to save just relevance
                  }
                }

                fetch(`/api/threads/${t.id}/response`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ relevanceScore: data.relevance })
                })
              }
            })
            .catch(() => {})
        }
      } catch {
        setError("Failed to connect to server")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [productId])

  const handleThreadSelect = useCallback((threadId: string) => {
    // Clear keepInThreadsId when navigating to a different thread
    // This allows the previous thread to move to Generated tab if it has a response
    if (keepInThreadsId && keepInThreadsId !== threadId) {
      setKeepInThreadsId(null)
    }

    setSelectedThreadId(threadId)

    const thread = product?.threads.find((t) => t.id === threadId)
    if (thread?.isNew) {
      updateThread(threadId, { isNew: false })
      fetch(`/api/threads/${threadId}/mark-read`, { method: "POST" })
    }
  }, [product?.threads, updateThread, keepInThreadsId])

  const handleDismiss = useCallback(async (threadId: string) => {
    // Calculate next thread to select before updating
    const currentActiveThreads = (product?.threads.filter((t) => t.status === "active") || [])
      .sort((a, b) => b.discoveredAt - a.discoveredAt)
    const currentIndex = currentActiveThreads.findIndex((t) => t.id === threadId)
    let nextThreadId: string | null = null
    
    if (currentIndex !== -1) {
      // If not the last thread, select the next one
      if (currentIndex < currentActiveThreads.length - 1) {
        nextThreadId = currentActiveThreads[currentIndex + 1].id
      } 
      // If it's the last thread, select the previous one
      else if (currentIndex > 0) {
        nextThreadId = currentActiveThreads[currentIndex - 1].id
      }
      // If it's the only thread, nextThreadId stays null
    }

    // Optimistic update - update UI immediately
    const previousStatus = product?.threads.find((t) => t.id === threadId)?.status
    updateThread(threadId, { status: "dismissed" })
    setSelectedThreadId(nextThreadId)

    // Handle API call in background, revert on failure
    try {
      const res = await fetch(`/api/threads/${threadId}/dismiss`, { method: "POST" })
      if (!res.ok) {
        // Revert optimistic update on failure
        if (previousStatus) {
          updateThread(threadId, { status: previousStatus })
          setSelectedThreadId(threadId)
        }
        toast.error("Failed to dismiss thread")
      }
    } catch {
      // Revert optimistic update on error
      if (previousStatus) {
        updateThread(threadId, { status: previousStatus })
        setSelectedThreadId(threadId)
      }
      toast.error("Failed to connect to server")
    }
  }, [product?.threads, updateThread])

  const handleRestore = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/threads/${threadId}/restore`, { method: "POST" })
    if (res.ok) {
      updateThread(threadId, { status: "active" })
    }
  }, [updateThread])

  const handleRefreshThreads = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch("/api/threads/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })

      const data = await res.json()
      if (res.ok) {
        if (data.newThreadsCount > 0) {
          toast.success(`Found ${pluralize(data.newThreadsCount, "new thread")}`)
          const productRes = await fetch(`/api/products/${productId}`)
          if (productRes.ok) {
            const productData = await productRes.json()
            setProduct(productData)
          }
        } else {
          toast.success("No new threads found")
        }
      } else {
        toast.error(data.error || "Failed to refresh threads")
      }
    } catch {
      toast.error("Failed to connect to server")
    } finally {
      setIsRefreshing(false)
    }
  }, [productId])

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-4 min-h-[500px]">
          <div className="w-2/5 space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="w-3/5">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              {error || "Product not found"}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const allActiveThreads = product.threads
    .filter((t) => t.status === "active")
    .sort((a, b) => {
      // Sort by discovery time (newest discovered first)
      // This keeps threads in stable positions - new threads naturally at top,
      // and opened threads stay in their relative positions
      return b.discoveredAt - a.discoveredAt
    })

  // Threads without generated responses (new/pending)
  // Also keep threads that have a response but should stay in Threads tab until user navigates away
  const activeThreads = allActiveThreads.filter((t) => !threadResponses[t.id] || t.id === keepInThreadsId)

  // Threads with generated responses (excluding ones kept in Threads tab)
  const generatedThreads = allActiveThreads.filter((t) => threadResponses[t.id] && t.id !== keepInThreadsId)

  const dismissedThreads = product.threads.filter((t) => t.status === "dismissed")
  const selectedThread = allActiveThreads.find((t) => t.id === selectedThreadId)
  const newThreadCount = activeThreads.filter((t) => t.isNew).length
  const generatedCount = generatedThreads.length

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <Link href={`/monitor/${productId}/settings`}>
            <Button variant="ghost" size="sm">
              <Settings className="size-4 mr-1" />
              Settings
            </Button>
          </Link>
        </div>
        <p className="text-muted-foreground">{product.description}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(tab) => {
        // Clear keepInThreadsId when switching tabs so the thread moves to Generated
        if (tab !== "threads" && keepInThreadsId) {
          setKeepInThreadsId(null)
        }
        setActiveTab(tab)
      }}>
        <TabsList>
          <TabsTrigger value="threads">
            Threads
            {newThreadCount > 0 && (
              <Badge variant="default" className="ml-2 h-5 min-w-5 px-1.5">
                {newThreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="generated">
            Generated
            {generatedCount > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1.5">
                {generatedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>

        <TabsContent value="threads">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Active Threads</CardTitle>
                  <CardDescription>
                    {pluralize(activeThreads.length, "active thread")}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshThreads}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4 mr-2" />
                      Find new threads
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeThreads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No active threads found
                </p>
              ) : (
                <div className="flex gap-4 min-h-[500px]">
                  <div className="w-2/5 border rounded-md overflow-hidden">
                    <div className="max-h-[500px] overflow-y-auto">
                      {activeThreads.map((thread) => (
                        <button
                          key={thread.id}
                          type="button"
                          onClick={() => handleThreadSelect(thread.id)}
                          className={`w-full text-left p-3 border-b last:border-b-0 transition-colors relative ${
                            selectedThreadId === thread.id
                              ? "bg-primary/10 border-l-4 border-l-primary font-medium"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="font-medium text-sm line-clamp-2 flex-1">
                              {thread.title}
                            </div>
                            {thread.isNew && (
                              <Badge variant="default" className="shrink-0">
                                New
                              </Badge>
                            )}
                          </div>
                          <ThreadMetadata
                            subreddit={thread.subreddit}
                            createdUtc={thread.createdUtc}
                            matchedKeyword={thread.matchedKeyword}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-3/5 border rounded-md p-4 flex flex-col">
                    {selectedThread && activeThreads.some(t => t.id === selectedThreadId) ? (
                      <div className="flex flex-col h-full">
                        <div className="space-y-4 mb-6">
                          <h3 className="font-semibold text-lg">
                            {selectedThread.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {truncateText(selectedThread.bodyPreview, 200)}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>r/{selectedThread.subreddit}</span>
                            <span>{formatRelativeTime(selectedThread.createdUtc)}</span>
                            {selectedThread.matchedKeyword && (
                              <span className="inline-flex items-center gap-1">
                                <span className="text-xs">Matched keyword:</span>
                                <Badge variant="outline" className="text-xs px-2 py-0.5 font-normal">
                                  {selectedThread.matchedKeyword}
                                </Badge>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <a
                              href={selectedThread.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              Open in Reddit
                              <ExternalLink className="size-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDismiss(selectedThread.id)}
                              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="size-3" />
                              Dismiss
                            </button>
                          </div>
                        </div>

                        <div className="border-t pt-4 flex-1">
                          <h4 className="font-medium mb-3">Response</h4>
                          <ResponseEditorPanel
                            threadId={selectedThread.id}
                            thread={{
                              title: selectedThread.title,
                              bodyPreview: selectedThread.bodyPreview,
                              subreddit: selectedThread.subreddit,
                            }}
                            product={{
                              name: product.name,
                              url: product.url,
                              description: product.description,
                              targetAudience: product.targetAudience,
                            }}
                            initialResponse={threadResponses[selectedThread.id] || ""}
                            initialCustomInstructions={threadCustomInstructions[selectedThread.id] || ""}
                            initialRelevance={threadRelevance[selectedThread.id] ?? null}
                            onResponseChange={(response) => {
                              // Keep this thread in Threads tab until user navigates away
                              if (!threadResponses[selectedThread.id] && response) {
                                setKeepInThreadsId(selectedThread.id)
                              }
                              setThreadResponses((prev) => ({
                                ...prev,
                                [selectedThread.id]: response,
                              }))
                            }}
                            onCustomInstructionsChange={(instructions) => {
                              setThreadCustomInstructions((prev) => ({
                                ...prev,
                                [selectedThread.id]: instructions,
                              }))
                            }}
                            onRelevanceChange={(relevance) => {
                              setThreadRelevance((prev) => ({
                                ...prev,
                                [selectedThread.id]: relevance,
                              }))
                            }}
                            onMarkRead={() => {
                              if (selectedThread.isNew) {
                                updateThread(selectedThread.id, { isNew: false })
                                fetch(`/api/threads/${selectedThread.id}/mark-read`, { method: "POST" })
                              }
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        Select a thread to view details
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generated">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Generated Responses</CardTitle>
                  <CardDescription>
                    {pluralize(generatedThreads.length, "thread")} with generated responses
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {generatedThreads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No threads with generated responses yet
                </p>
              ) : (
                <div className="flex gap-4 min-h-[500px]">
                  <div className="w-2/5 border rounded-md overflow-hidden">
                    <div className="max-h-[500px] overflow-y-auto">
                      {generatedThreads.map((thread) => (
                        <button
                          key={thread.id}
                          type="button"
                          onClick={() => handleThreadSelect(thread.id)}
                          className={`w-full text-left p-3 border-b last:border-b-0 transition-colors relative ${
                            selectedThreadId === thread.id
                              ? "bg-primary/10 border-l-4 border-l-primary font-medium"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="font-medium text-sm line-clamp-2 flex-1">
                              {thread.title}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span title="Response generated">
                                <Sparkles className="size-3.5 text-primary" />
                              </span>
                            </div>
                          </div>
                          <ThreadMetadata
                            subreddit={thread.subreddit}
                            createdUtc={thread.createdUtc}
                            matchedKeyword={thread.matchedKeyword}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-3/5 border rounded-md p-4 flex flex-col">
                    {selectedThread && generatedThreads.some(t => t.id === selectedThreadId) ? (
                      <div className="flex flex-col h-full">
                        <div className="space-y-4 mb-6">
                          <h3 className="font-semibold text-lg">
                            {selectedThread.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {truncateText(selectedThread.bodyPreview, 200)}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>r/{selectedThread.subreddit}</span>
                            <span>{formatRelativeTime(selectedThread.createdUtc)}</span>
                            {selectedThread.matchedKeyword && (
                              <span className="inline-flex items-center gap-1">
                                <span className="text-xs">Matched keyword:</span>
                                <Badge variant="outline" className="text-xs px-2 py-0.5 font-normal">
                                  {selectedThread.matchedKeyword}
                                </Badge>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <a
                              href={selectedThread.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              Open in Reddit
                              <ExternalLink className="size-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDismiss(selectedThread.id)}
                              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X className="size-3" />
                              Dismiss
                            </button>
                          </div>
                        </div>

                        <div className="border-t pt-4 flex-1">
                          <h4 className="font-medium mb-3">Response</h4>
                          <ResponseEditorPanel
                            threadId={selectedThread.id}
                            thread={{
                              title: selectedThread.title,
                              bodyPreview: selectedThread.bodyPreview,
                              subreddit: selectedThread.subreddit,
                            }}
                            product={{
                              name: product.name,
                              url: product.url,
                              description: product.description,
                              targetAudience: product.targetAudience,
                            }}
                            initialResponse={threadResponses[selectedThread.id] || ""}
                            initialCustomInstructions={threadCustomInstructions[selectedThread.id] || ""}
                            initialRelevance={threadRelevance[selectedThread.id] ?? null}
                            onResponseChange={(response) => {
                              setThreadResponses((prev) => ({
                                ...prev,
                                [selectedThread.id]: response,
                              }))
                            }}
                            onCustomInstructionsChange={(instructions) => {
                              setThreadCustomInstructions((prev) => ({
                                ...prev,
                                [selectedThread.id]: instructions,
                              }))
                            }}
                            onRelevanceChange={(relevance) => {
                              setThreadRelevance((prev) => ({
                                ...prev,
                                [selectedThread.id]: relevance,
                              }))
                            }}
                            onMarkRead={() => {
                              if (selectedThread.isNew) {
                                updateThread(selectedThread.id, { isNew: false })
                                fetch(`/api/threads/${selectedThread.id}/mark-read`, { method: "POST" })
                              }
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        Select a thread to view details
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dismissed">
          <Card>
            <CardHeader>
              <CardTitle>Dismissed Threads</CardTitle>
              <CardDescription>
                {pluralize(dismissedThreads.length, "dismissed thread")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dismissedThreads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No dismissed threads
                </p>
              ) : (
                <div className="space-y-2">
                  {dismissedThreads.map((thread) => (
                    <div
                      key={thread.id}
                      className="border rounded-md p-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-2">
                            {thread.title}
                          </div>
                          <ThreadMetadata 
                            subreddit={thread.subreddit} 
                            createdUtc={thread.createdUtc}
                            matchedKeyword={thread.matchedKeyword}
                          />
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRestore(thread.id)}
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                          >
                            <RotateCcw className="size-3" />
                            Restore
                          </button>
                          <a
                            href={thread.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            View
                            <ExternalLink className="size-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
