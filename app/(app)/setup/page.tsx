"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Step 2 will be implemented in the next phase.
              </p>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                {JSON.stringify(state.productInfo, null, 2)}
              </pre>
              <div className="flex justify-between pt-2">
                <Button type="button" variant="outline" onClick={handleBack}>
                  <ArrowLeft data-icon="inline-start" />
                  Back
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
