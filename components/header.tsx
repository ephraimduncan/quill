"use client"

import { IconMenu2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Toggle menu"
        >
          <IconMenu2 className="size-5" />
        </Button>
        <span className="font-semibold text-lg">Reddit Agent</span>
      </div>
      <UserMenu />
    </header>
  )
}
