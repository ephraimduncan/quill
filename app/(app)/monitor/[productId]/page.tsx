"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ResponseEditorPanel } from "@/components/response-editor-panel"

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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await fetch(`/api/products/${productId}`)
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || "Failed to load product")
          return
        }

        setProduct(data)
        const activeThreads = data.threads.filter(
          (t: Thread) => t.status === "active"
        )
        if (activeThreads.length > 0) {
          setSelectedThreadId(activeThreads[0].id)
        }
      } catch {
        setError("Failed to connect to server")
      } finally {
        setIsLoading(false)
      }
    }

    fetchProduct()
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

  const activeThreads = product.threads.filter((t) => t.status === "active")
  const selectedThread = activeThreads.find((t) => t.id === selectedThreadId)

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="text-muted-foreground">{product.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Threads</CardTitle>
          <CardDescription>
            {activeThreads.length} active thread{activeThreads.length !== 1 ? "s" : ""}
          </CardDescription>
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
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                        selectedThreadId === thread.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="font-medium text-sm line-clamp-2">
                        {thread.title}
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
                      <a
                        href={selectedThread.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Open in Reddit
                        <ExternalLink className="size-3" />
                      </a>
                    </div>

                    <div className="border-t pt-4 flex-1">
                      <h4 className="font-medium mb-3">Response</h4>
                      <ResponseEditorPanel
                        key={selectedThread.id}
                        thread={{
                          title: selectedThread.title,
                          bodyPreview: selectedThread.bodyPreview,
                          subreddit: selectedThread.subreddit,
                        }}
                        product={{
                          name: product.name,
                          description: product.description,
                          targetAudience: product.targetAudience,
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
    </div>
  )
}
