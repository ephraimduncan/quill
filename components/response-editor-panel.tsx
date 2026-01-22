"use client"

import { useState, useEffect } from "react"
import { RefreshCw, Sparkles, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

function normalizeResponse(text: string): string {
  return text.replace(/—/g, "; ").replace(/\n{2,}/g, "\n")
}

type Thread = {
  title: string
  bodyPreview: string
  subreddit: string
}

type Product = {
  name: string
  url: string
  description: string
  targetAudience: string
}

type ResponseEditorPanelProps = {
  threadId: string
  thread: Thread
  product: Product
  initialResponse?: string
  initialCustomInstructions?: string
  initialRelevance?: number | null
  onResponseChange?: (response: string) => void
  onCustomInstructionsChange?: (instructions: string) => void
  onRelevanceChange?: (relevance: number) => void
  onMarkRead?: () => void
}

function RelevanceBadge({ relevance }: { relevance: number }) {
  const color =
    relevance >= 70
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : relevance >= 40
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"

  return (
    <span className={cn("text-xs font-medium px-2 py-1 rounded-full", color)}>
      {relevance}% relevant
    </span>
  )
}

export function ResponseEditorPanel({
  threadId,
  thread,
  product,
  initialResponse = "",
  initialCustomInstructions = "",
  initialRelevance = null,
  onResponseChange,
  onCustomInstructionsChange,
  onRelevanceChange,
  onMarkRead,
}: ResponseEditorPanelProps) {
  const [response, setResponse] = useState(initialResponse)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [customInstructions, setCustomInstructions] = useState(initialCustomInstructions)
  const [relevance, setRelevance] = useState<number | null>(initialRelevance)

  // Sync with initial values when thread changes
  useEffect(() => {
    setResponse(normalizeResponse(initialResponse))
    setCustomInstructions(initialCustomInstructions)
    setRelevance(initialRelevance)
  }, [initialResponse, initialCustomInstructions, initialRelevance])

  // Auto-fetch relevance when thread is viewed and has no score
  useEffect(() => {
    if (initialRelevance !== null) return

    const { thread: threadPayload, product: productPayload } = getPayloads()

    fetch("/api/response/relevance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: threadPayload, product: productPayload }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.relevance === "number") {
          setRelevance(data.relevance)
          onRelevanceChange?.(data.relevance)
          saveToServer({ relevanceScore: data.relevance })
        }
      })
      .catch(() => {})
  }, [threadId])

  function getPayloads() {
    return {
      thread: {
        title: thread.title,
        body: thread.bodyPreview,
        subreddit: thread.subreddit,
      },
      product: {
        name: product.name,
        url: product.url,
        description: product.description,
        targetAudience: product.targetAudience,
      },
    }
  }

  function saveToServer(data: {
    generatedResponse?: string
    customInstructions?: string
    relevanceScore?: number
  }) {
    fetch(`/api/threads/${threadId}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  }

  async function generateResponse() {
    setIsGenerating(true)
    setError(null)

    const { thread: threadPayload, product: productPayload } = getPayloads()
    const needsRelevanceCheck = relevance === null

    try {
      const responsePromise = fetch("/api/response/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: threadPayload,
          product: productPayload,
          customInstructions: customInstructions,
        }),
      })

      const relevancePromise = needsRelevanceCheck
        ? fetch("/api/response/relevance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              thread: threadPayload,
              product: productPayload,
            }),
          })
        : null

      const [responseRes, relevanceRes] = await Promise.all([
        responsePromise,
        relevancePromise,
      ])

      const responseData = await responseRes.json()

      if (!responseRes.ok) {
        setError(responseData.error || "Failed to generate response")
        return
      }

      const normalized = normalizeResponse(responseData.response)
      setResponse(normalized)
      onResponseChange?.(normalized)

      const saveData: { generatedResponse: string; customInstructions?: string; relevanceScore?: number } = {
        generatedResponse: normalized,
      }
      if (customInstructions) {
        saveData.customInstructions = customInstructions
      }

      if (relevanceRes) {
        const relevanceData = await relevanceRes.json()
        if (relevanceRes.ok && typeof relevanceData.relevance === "number") {
          setRelevance(relevanceData.relevance)
          onRelevanceChange?.(relevanceData.relevance)
          saveData.relevanceScore = relevanceData.relevance
        }
      }

      saveToServer(saveData)
      onMarkRead?.()
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsGenerating(false)
    }
  }

  function handleResponseChange(value: string) {
    setResponse(value)
    onResponseChange?.(value)
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(normalizeResponse(response))
    setCopied(true)
    toast.success("Response copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const hasResponse = response.length > 0
  const showInitialState = !hasResponse && !isGenerating
  const showEditor = hasResponse && !isGenerating

  const CopyIcon = copied ? Check : Copy
  const copyLabel = copied ? "Copied" : "Copy"

  return (
    <div className="space-y-4">
      {(showInitialState || showEditor) && (
        <Textarea
          value={customInstructions}
          onChange={(e) => {
            const value = e.target.value
            setCustomInstructions(value)
            onCustomInstructionsChange?.(value)
          }}
          placeholder="Optional: Add specific instructions for this response..."
          rows={3}
          className="resize-none"
        />
      )}

      {showInitialState && (
        <>
          {relevance !== null && (
            <div className="flex items-center">
              <RelevanceBadge relevance={relevance} />
            </div>
          )}
          <Button onClick={generateResponse}>
            <Sparkles className="size-4 mr-2" />
            Generate Response
          </Button>
        </>
      )}

      {isGenerating && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" className="mr-2" />
          <span className="text-muted-foreground">Generating response...</span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showEditor && (
        <>
          {relevance !== null && (
            <div className="flex items-center">
              <RelevanceBadge relevance={relevance} />
            </div>
          )}
          <Textarea
            value={response}
            onChange={(e) => handleResponseChange(e.target.value)}
            placeholder="Your response..."
            rows={10}
            className="resize-none"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={generateResponse}
              disabled={isGenerating}
            >
              <RefreshCw className="size-4 mr-2" />
              Regenerate
            </Button>
            <Button onClick={copyToClipboard}>
              <CopyIcon className="size-4 mr-2" />
              {copyLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
