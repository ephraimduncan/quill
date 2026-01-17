"use client"

import { useState } from "react"
import { RefreshCw, Send, Sparkles, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { signIn } from "@/lib/auth/client"

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
  tokenExpired?: boolean
}

export function ResponseEditorPanel({
  thread,
  product,
  onResponseChange,
  onPostSuccess,
  tokenExpired = false,
}: ResponseEditorPanelProps) {
  const [response, setResponse] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPosted, setIsPosted] = useState(false)
  const [needsReauth, setNeedsReauth] = useState(tokenExpired)

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
        if (data.needsReauth) {
          setNeedsReauth(true)
        }
        setError(data.error || "Failed to post to Reddit")
        return
      }

      setIsPosted(true)
      toast.success("Posted to Reddit successfully!")
      onPostSuccess?.(data.commentUrl)
    } catch {
      setError("Failed to connect to server")
    } finally {
      setIsPosting(false)
    }
  }

  const handleReauth = async () => {
    await signIn.social({ provider: "reddit", callbackURL: window.location.href })
  }

  const hasResponse = response.length > 0
  const postingDisabled = isPosting || isPosted || !response.trim() || needsReauth

  return (
    <div className="space-y-4">
      {needsReauth && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <AlertCircle className="size-5 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm text-amber-800">
            Your Reddit session has expired. Please sign in again to post.
          </div>
          <Button size="sm" variant="outline" onClick={handleReauth}>
            Sign in
          </Button>
        </div>
      )}

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

      {error && !needsReauth && <p className="text-sm text-destructive">{error}</p>}

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
              disabled={postingDisabled}
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
