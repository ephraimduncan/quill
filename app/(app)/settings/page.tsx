"use client"

import { Button } from "@/components/ui/button"
import { signOut } from "@/lib/auth/client"

export default function SettingsPage() {
  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium mb-2">Account</h2>
          <Button variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}
