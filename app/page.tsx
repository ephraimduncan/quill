"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { IconBrandReddit } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useSession, signIn } from "@/lib/auth/client"

export default function LandingPage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  useEffect(() => {
    if (session?.user) {
      router.replace("/dashboard")
    }
  }, [session, router])

  const handleSignIn = () => {
    signIn.social({ provider: "reddit" })
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (session?.user) {
    return null
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-4xl font-bold">Reddit Agent</h1>
        <p className="text-lg text-muted-foreground">
          Discover Reddit threads where users discuss problems your product solves,
          and engage authentically to drive awareness.
        </p>
        <Button size="lg" onClick={handleSignIn} className="gap-2">
          <IconBrandReddit className="size-5" />
          Sign in with Reddit
        </Button>
      </div>
    </div>
  )
}
