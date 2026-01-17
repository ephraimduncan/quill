"use client"

import { useState } from "react"
import { RefreshCw, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"

type Thread = {
  id: string
  redditThreadId: string
  title: string
  bodyPreview: string
  subreddit: string
}

type Product = {
  id: string
  name: string
  description: string
  targetAudience: string
}

type ResponseEditorPanelProps = {
  thread: Thread
  product: Product
  onResponseChange?: (response: string) => void
  onPostSuccess?: (commentUrl: string | null) => void
}

export function ResponseEditorPanel({
  thread,
  product,
  onResponseChange,
  onPostSuccess,
}: ResponseEditorPanelProps) {
  const [response, setResponse] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPosted, setIsPosted] = useState(false)

  const generateResponse = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const res = await fetch("/api/response/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: {
            title: thread.title,
            body: thread.bodyPreview,
            subreddit: thread.subreddit,
          },
          product: {
            name: product.name,
            description: product.description,
            targetAudience: product.targetAudience,
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to generate response")
        return
      }

      setResponse(data.response)
      onResponseChange?.(data.response)
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleResponseChange = (value: string) => {
    setResponse(value)
    onResponseChange?.(value)
  }

  const postToReddit = async () => {
    setIsPosting(true)
    setError(null)

    try {
      const res = await fetch("/api/response/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          redditThreadId: thread.redditThreadId,
          productId: product.id,
          response,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to post to Reddit")
        return
      }

      setIsPosted(true)
      onPostSuccess?.(data.commentUrl)
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsPosting(false)
    }
  }

  const hasResponse = response.length > 0

  return (
    <div className="space-y-4">
      {!hasResponse && !isGenerating && (
        <Button onClick={generateResponse} className="w-full">
          <Sparkles className="size-4 mr-2" />
          Generate Response
        </Button>
      )}

      {isGenerating && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" className="mr-2" />
          <span className="text-muted-foreground">Generating response...</span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {hasResponse && !isGenerating && (
        <>
          <Textarea
            value={response}
            onChange={(e) => handleResponseChange(e.target.value)}
            placeholder="Your response..."
            rows={10}
            className="resize-none"
            disabled={isPosted || isPosting}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={generateResponse}
              disabled={isGenerating || isPosting || isPosted}
            >
              <RefreshCw className="size-4 mr-2" />
              Regenerate
            </Button>
            <Button
              onClick={postToReddit}
              disabled={isPosting || isPosted || !response.trim()}
            >
              {isPosting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Posting...
                </>
              ) : isPosted ? (
                "Posted"
              ) : (
                <>
                  <Send className="size-4 mr-2" />
                  Post to Reddit
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
