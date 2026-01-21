"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Plus, X, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

type Product = {
  id: string
  name: string
  description: string
  targetAudience: string
  url: string
  keywords: string[]
}

export default function SettingsPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.productId as string

  const [product, setProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newKeyword, setNewKeyword] = useState("")

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [targetAudience, setTargetAudience] = useState("")
  const [url, setUrl] = useState("")
  const [keywords, setKeywords] = useState<string[]>([])

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products/${productId}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Failed to load product")
          return
        }

        setProduct(data)
        setName(data.name)
        setDescription(data.description || "")
        setTargetAudience(data.targetAudience || "")
        setUrl(data.url)
        setKeywords(data.keywords || [])
      } catch {
        setError("Failed to connect to server")
      } finally {
        setIsLoading(false)
      }
    }

    fetchProduct()
  }, [productId])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Product name is required")
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          targetAudience: targetAudience.trim(),
          url: url.trim(),
          keywords,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Failed to save changes")
        return
      }

      toast.success("Changes saved")
      setProduct((prev) => prev ? { ...prev, name, description, targetAudience, url, keywords } : null)
    } catch {
      toast.error("Failed to connect to server")
    } finally {
      setIsSaving(false)
    }
  }, [productId, name, description, targetAudience, url, keywords])

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to delete product")
        return
      }

      toast.success("Product deleted")
      router.push("/dashboard")
    } catch {
      toast.error("Failed to connect to server")
    } finally {
      setIsDeleting(false)
    }
  }, [productId, router])

  const addKeyword = useCallback(() => {
    const keyword = newKeyword.trim()
    if (!keyword) return
    if (keywords.includes(keyword)) {
      toast.error("Keyword already exists")
      return
    }
    setKeywords((prev) => [...prev, keyword])
    setNewKeyword("")
  }, [newKeyword, keywords])

  const removeKeyword = useCallback((index: number) => {
    setKeywords((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const hasChanges = product && (
    name !== product.name ||
    description !== (product.description || "") ||
    targetAudience !== (product.targetAudience || "") ||
    url !== product.url ||
    JSON.stringify(keywords) !== JSON.stringify(product.keywords)
  )

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              {error || "Product not found"}
            </p>
            <div className="flex justify-center mt-4">
              <Link href="/dashboard">
                <Button variant="outline">Back to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          href={`/monitor/${productId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="size-4" />
          Back to monitor
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your product settings and keywords</p>
      </div>

      <div className="space-y-6">
        {/* Product Details */}
        <Card>
          <CardHeader>
            <CardTitle>Product Details</CardTitle>
            <CardDescription>
              Update your product information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Product name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Product"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="url" className="text-sm font-medium">
                URL
              </label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourproduct.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Who is this product for?"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Keywords */}
        <Card>
          <CardHeader>
            <CardTitle>Keywords</CardTitle>
            <CardDescription>
              Manage the keywords used to find relevant Reddit discussions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            {keywords.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword, index) => (
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
            ) : (
              <p className="text-sm text-muted-foreground">
                No keywords added yet. Add keywords to find relevant Reddit discussions.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              {keywords.length} keyword{keywords.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions that affect your product
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete this product</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this product and all its data
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger render={
                  <Button variant="destructive" disabled={isDeleting}>
                    <Trash2 className="size-4 mr-2" />
                    Delete
                  </Button>
                } />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete product?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &quot;{product.name}&quot; and all its
                      keywords and discovered threads. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Deleting...
                        </>
                      ) : (
                        "Delete Product"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
