"use client"

import Image from "next/image"
import { IconLogout, IconUser } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession, signOut } from "@/lib/auth/client"

export function UserMenu() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return <Skeleton className="size-8 rounded-full" />
  }

  if (!session?.user) {
    return null
  }

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name || "User avatar"}
              width={32}
              height={32}
              className="size-8 rounded-full"
              unoptimized
            />
          ) : (
            <div className="size-8 rounded-full bg-primary flex items-center justify-center">
              <IconUser className="size-4 text-primary-foreground" />
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{session.user.name}</p>
          {session.user.email && (
            <p className="text-xs text-muted-foreground">{session.user.email}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <IconLogout className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
