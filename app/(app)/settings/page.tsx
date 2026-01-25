"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { signOut } from "@/lib/auth/client"
import { toast } from "sonner"

export default function SettingsPage() {
  const router = useRouter()
  const [blockedAuthors, setBlockedAuthors] = useState<string[]>([])
  const [newBlockedAuthor, setNewBlockedAuthor] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchBlockedAuthors() {
      try {
        const res = await fetch("/api/settings/blocked-authors")
        if (res.ok) {
          const data = await res.json()
          setBlockedAuthors(data)
        }
      } catch {
        toast.error("Failed to load blocked authors")
      } finally {
        setIsLoading(false)
      }
    }
    fetchBlockedAuthors()
  }, [])

  const addBlockedAuthor = useCallback(async () => {
    const username = newBlockedAuthor.trim().replace(/^u\//, "")
    if (!username) return
    if (blockedAuthors.some((a) => a.toLowerCase() === username.toLowerCase())) {
      toast.error("Author already blocked")
      return
    }

    try {
      const res = await fetch("/api/settings/blocked-authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to block author")
        return
      }

      setBlockedAuthors((prev) => [...prev, username])
      setNewBlockedAuthor("")
      toast.success(`Blocked u/${username}`)
    } catch {
      toast.error("Failed to connect to server")
    }
  }, [newBlockedAuthor, blockedAuthors])

  const removeBlockedAuthor = useCallback(async (username: string) => {
    try {
      const res = await fetch(`/api/settings/blocked-authors/${encodeURIComponent(username)}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        toast.error("Failed to unblock author")
        return
      }

      setBlockedAuthors((prev) => prev.filter((a) => a !== username))
      toast.success(`Unblocked u/${username}`)
    } catch {
      toast.error("Failed to connect to server")
    }
  }, [])

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Global Blocked Authors</CardTitle>
            <CardDescription>
              Posts and comments from these Reddit users will be ignored across all products
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-8 w-48" />
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="Reddit username (e.g. spez)"
                    value={newBlockedAuthor}
                    onChange={(e) => setNewBlockedAuthor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addBlockedAuthor()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addBlockedAuthor}>
                    <Plus className="size-4" />
                  </Button>
                </div>

                {blockedAuthors.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {blockedAuthors.map((username) => (
                      <div
                        key={username}
                        className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm"
                      >
                        u/{username}
                        <button
                          type="button"
                          onClick={() => removeBlockedAuthor(username)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No blocked authors. Add usernames to filter out posts from specific users across all products.
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  {blockedAuthors.length} blocked author{blockedAuthors.length === 1 ? "" : "s"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() =>
                signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push("/login")
                    },
                  },
                })
              }
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
