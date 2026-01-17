"use client"

import { useState } from "react"
import { RefreshCw, Sparkles, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"

type Thread = {
  title: string
  bodyPreview: string
  subreddit: string
}

type Product = {
  name: string
  description: string
  targetAudience: string
}

type ResponseEditorPanelProps = {
  thread: Thread
  product: Product
  onResponseChange?: (response: string) => void
}

export function ResponseEditorPanel({
  thread,
  product,
  onResponseChange,
}: ResponseEditorPanelProps) {
  const [response, setResponse] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(response)
    setCopied(true)
    toast.success("Response copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
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
              {copied ? (
                <>
                  <Check className="size-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
