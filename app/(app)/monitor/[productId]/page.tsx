"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ExternalLink, X, RotateCcw, RefreshCw, AlertCircle, Pencil } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ResponseEditorPanel } from "@/components/response-editor-panel"
import { toast } from "sonner"
import { signIn } from "@/lib/auth/client"

type Thread = {
  id: string
  redditThreadId: string
  title: string
  bodyPreview: string
  subreddit: string
  url: string
  createdUtc: number
  status: "active" | "dismissed"
  isNew: boolean
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

type HistoryItem = {
  id: string
  threadId: string
  responseSnippet: string
  redditCommentUrl: string
  postedAt: number
  threadTitle: string
  threadSubreddit: string
  threadUrl: string
}

function formatRelativeTime(timestamp: number) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function MonitorPage() {
  const params = useParams()
  const productId = params.productId as string

  const [product, setProduct] = useState<Product | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("threads")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [productRes, historyRes, tokenRes] = await Promise.all([
          fetch(`/api/products/${productId}`),
          fetch(`/api/history/${productId}`),
          fetch("/api/auth/token-status"),
        ])

        const productData = await productRes.json()
        if (!productRes.ok) {
          setError(productData.error || "Failed to load product")
          return
        }

        setProduct(productData)
        const activeThreads = productData.threads.filter(
          (t: Thread) => t.status === "active"
        )
        if (activeThreads.length > 0) {
          setSelectedThreadId(activeThreads[0].id)
        }

        if (historyRes.ok) {
          const historyData = await historyRes.json()
          setHistory(historyData)
        }

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json()
          setTokenExpired(tokenData.needsReauth === true)
        }
      } catch {
        setError("Failed to connect to server")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [productId])

  const handleThreadSelect = useCallback(async (threadId: string) => {
    setSelectedThreadId(threadId)

    const thread = product?.threads.find((t) => t.id === threadId)
    if (thread?.isNew) {
      await fetch(`/api/threads/${threadId}/mark-read`, { method: "POST" })
      setProduct((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          threads: prev.threads.map((t) =>
            t.id === threadId ? { ...t, isNew: false } : t
          ),
        }
      })
    }
  }, [product?.threads])

  const handleDismiss = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/threads/${threadId}/dismiss`, { method: "POST" })
    if (res.ok) {
      setProduct((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          threads: prev.threads.map((t) =>
            t.id === threadId ? { ...t, status: "dismissed" as const } : t
          ),
        }
      })
      const remaining = product?.threads.filter(
        (t) => t.status === "active" && t.id !== threadId
      )
      if (remaining && remaining.length > 0) {
        setSelectedThreadId(remaining[0].id)
      } else {
        setSelectedThreadId(null)
      }
    }
  }, [product?.threads])

  const handleRestore = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/threads/${threadId}/restore`, { method: "POST" })
    if (res.ok) {
      setProduct((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          threads: prev.threads.map((t) =>
            t.id === threadId ? { ...t, status: "active" as const } : t
          ),
        }
      })
    }
  }, [])

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
          toast.success(`Found ${data.newThreadsCount} new thread${data.newThreadsCount === 1 ? "" : "s"}`)
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

  const handleReauth = async () => {
    await signIn.social({ provider: "reddit", callbackURL: window.location.href })
  }

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

  const activeThreads = product.threads.filter((t) => t.status === "active")
  const dismissedThreads = product.threads.filter((t) => t.status === "dismissed")
  const selectedThread = activeThreads.find((t) => t.id === selectedThreadId)
  const newThreadCount = activeThreads.filter((t) => t.isNew).length

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <Link href={`/setup?edit=${productId}`}>
            <Button variant="ghost" size="sm">
              <Pencil className="size-4 mr-1" />
              Edit
            </Button>
          </Link>
        </div>
        <p className="text-muted-foreground">{product.description}</p>
      </div>

      {tokenExpired && (
        <div className="flex items-center gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-md">
          <AlertCircle className="size-5 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm text-amber-800">
            Your Reddit session has expired. You can browse threads, but you&apos;ll need to sign in again to post.
          </div>
          <Button size="sm" variant="outline" onClick={handleReauth}>
            Sign in with Reddit
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="threads">
            Threads
            {newThreadCount > 0 && (
              <Badge variant="default" className="ml-2 h-5 min-w-5 px-1.5">
                {newThreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>

        <TabsContent value="threads">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Active Threads</CardTitle>
                  <CardDescription>
                    {activeThreads.length} active thread{activeThreads.length !== 1 ? "s" : ""}
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
                          className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                            selectedThreadId === thread.id ? "bg-muted" : ""
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
                          <div className="text-xs text-muted-foreground mt-1">
                            r/{thread.subreddit} · {formatRelativeTime(thread.createdUtc)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-3/5 border rounded-md p-4 flex flex-col">
                    {selectedThread ? (
                      <div className="flex flex-col h-full">
                        <div className="space-y-4 mb-6">
                          <h3 className="font-semibold text-lg">
                            {selectedThread.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {selectedThread.bodyPreview.length > 200
                              ? `${selectedThread.bodyPreview.slice(0, 200)}...`
                              : selectedThread.bodyPreview || "No preview available"}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>r/{selectedThread.subreddit}</span>
                            <span>{formatRelativeTime(selectedThread.createdUtc)}</span>
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
                            key={selectedThread.id}
                            thread={{
                              id: selectedThread.id,
                              redditThreadId: selectedThread.redditThreadId,
                              title: selectedThread.title,
                              bodyPreview: selectedThread.bodyPreview,
                              subreddit: selectedThread.subreddit,
                            }}
                            product={{
                              id: product.id,
                              name: product.name,
                              description: product.description,
                              targetAudience: product.targetAudience,
                            }}
                            tokenExpired={tokenExpired}
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

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Post History</CardTitle>
              <CardDescription>
                {history.length} post{history.length !== 1 ? "s" : ""} made
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No posts yet. Generate and post a response to see it here.
                </p>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="border rounded-md p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm line-clamp-1">
                            {item.threadTitle}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            r/{item.threadSubreddit} · {formatRelativeTime(item.postedAt)}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {item.responseSnippet}...
                          </p>
                        </div>
                        <a
                          href={item.redditCommentUrl || item.threadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
                        >
                          View
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </div>
                  ))}
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
                {dismissedThreads.length} dismissed thread{dismissedThreads.length !== 1 ? "s" : ""}
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
                          <div className="text-xs text-muted-foreground mt-1">
                            r/{thread.subreddit} · {formatRelativeTime(thread.createdUtc)}
                          </div>
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
