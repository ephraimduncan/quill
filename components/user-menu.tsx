"use client"

import Image from "next/image"
import { IconLogout, IconUser } from "@tabler/icons-react"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useSession, signOut } from "@/lib/auth/client"
import { cn } from "@/lib/utils"

export function UserMenu() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return <Skeleton className="size-8 rounded-full" />
  }

  if (!session?.user) {
    return null
  }

  const { user } = session

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full")}
      >
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name || "User avatar"}
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user.name}</p>
          {user.email && (
            <p className="text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <IconLogout className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
