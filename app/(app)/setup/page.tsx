"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Globe } from "lucide-react"
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

type WizardState = {
  step: number
  url: string
  productInfo: ProductInfo | null
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
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    </div>
  )
}
